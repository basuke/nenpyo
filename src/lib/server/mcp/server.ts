/**
 * MCP の JSON-RPC。**HTTP を知らない**（docs/007-mcp.md）。
 *
 * 受けるのは解析済みのメッセージ 1 通で、返すのは応答 1 通か、
 * 通知なら null。枠（HTTP の status、ヘッダ、405）は `http.ts` の仕事。
 *
 * 分けてあるのは、ここが**入り口の都合に依らない**部分だからで、
 * `page()` / `json()` に対する `actions/` と同じ関係にある。
 */

import { isAppError } from "../errors";
import { requireScope, toolsFor, SCOPES } from "./tools";
import type { AppContext } from "../context";
import type { RawInput } from "../input";

/**
 * 話せるプロトコル版。新しい順。
 *
 * 2026-07-28 でセッションと GET ストリームが仕様から消えた。それ以前の版とも
 * 話せるようにしてあるのは、いま出回っているクライアントの多くが
 * `initialize` から始める古い流儀だから。**サーバー側の実装は同じ**で、
 * 違うのは初手の握手があるかどうかだけ。
 */
export const PROTOCOL_VERSIONS = [
  "2026-07-28",
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
];
const LATEST = PROTOCOL_VERSIONS[0];

export const SERVER_INFO = { name: "nenpyo.net", version: "0.1.0" };

/* ── JSON-RPC の形 ────────────────────────────────────────────────────── */

export type JsonRpcId = string | number;

export type JsonRpcMessage = {
  jsonrpc?: unknown;
  id?: JsonRpcId | null;
  method?: unknown;
  params?: unknown;
};

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId | null;
      error: { code: number; message: string; data?: unknown };
    };

export const ErrorCode = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  /** ヘッダと本文が食い違っている（MCP 仕様が定める番号） */
  headerMismatch: -32020,
} as const;

/** JSON-RPC の失敗。HTTP の status は `http.ts` が決める。 */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export const rpcError = (
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });

const rpcResult = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  result,
});

/* ── 差し出す ─────────────────────────────────────────────────────────── */

/**
 * メッセージを 1 通さばく。
 *
 * 通知（`id` が無い）には `null` を返す。呼ぶ側はそれを 202 にする。
 */
export async function handleMessage(
  ctx: AppContext,
  granted: readonly string[],
  message: JsonRpcMessage,
): Promise<JsonRpcResponse | null> {
  const method = typeof message.method === "string" ? message.method : "";
  const id = message.id ?? null;
  const params = (message.params ?? {}) as Record<string, unknown>;

  // 通知。応答は返さない。
  if (id === null) {
    if (method.startsWith("notifications/")) return null;
    return rpcError(null, ErrorCode.invalidRequest, `通知として扱えない method: ${method}`);
  }

  try {
    return rpcResult(id, await dispatch(ctx, granted, method, params));
  } catch (cause) {
    if (cause instanceof RpcError) return rpcError(id, cause.code, cause.message, cause.data);
    throw cause;
  }
}

async function dispatch(
  ctx: AppContext,
  granted: readonly string[],
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (method) {
    case "initialize":
      return initialize(params);

    case "ping":
      return {};

    case "tools/list":
      return {
        tools: toolsFor(granted).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };

    case "tools/call":
      return callTool(ctx, granted, params);

    default:
      throw new RpcError(ErrorCode.methodNotFound, `知らない method: ${method}`);
  }
}

/**
 * 古い流儀のクライアントが最初に送ってくる握手。
 *
 * 相手の言う版が話せるならそれを返し、話せないなら**こちらの最新を返す**。
 * 拒まないのは、tools/list と tools/call の形がどの版でも同じだから。
 */
function initialize(params: Record<string, unknown>) {
  const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
  return {
    protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : LATEST,
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
  };
}

/**
 * tool を 1 つ動かす。
 *
 * **操作が投げた `AppError` は、JSON-RPC の失敗ではなく tool の結果として返す。**
 * 「他人の年表は編集できません」は protocol の故障ではなく、AI が読んで
 * やり直せる筋の話なので、`isError` を立てて中身を渡すほうが噛み合う。
 */
async function callTool(
  ctx: AppContext,
  granted: readonly string[],
  params: Record<string, unknown>,
) {
  const name = typeof params.name === "string" ? params.name : "";
  const tool = toolsFor(SCOPES).find((candidate) => candidate.name === name);
  if (!tool) throw new RpcError(ErrorCode.invalidParams, `知らない tool: ${name}`);

  requireScope(tool, granted);

  const args = (params.arguments ?? {}) as RawInput;

  try {
    const value = await tool.run(ctx, args);
    return {
      content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
      structuredContent: value,
    };
  } catch (cause) {
    if (!isAppError(cause)) throw cause;
    const error = { code: cause.code ?? null, message: cause.message };
    return {
      content: [{ type: "text", text: JSON.stringify({ error }, null, 2) }],
      structuredContent: { error },
      isError: true,
    };
  }
}
