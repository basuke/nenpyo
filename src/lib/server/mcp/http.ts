/**
 * MCP の HTTP 枠（docs/007-mcp.md）。
 *
 * Streamable HTTP は 2026-07-28 で**セッションと GET ストリームが消えた**。
 * サーバーが用意するのは POST を受ける 1 本だけで、応答は単一の JSON でよい。
 * 状態を持たないので Durable Objects は要らない。
 *
 * ここでやるのは枠だけ。中身は `server.ts`、操作は `actions/`。
 */

import { isAppError } from "../errors";
import { ErrorCode, handleMessage, rpcError, type JsonRpcMessage } from "./server";
import { TOOLS } from "./tools";
import type { AppContext } from "../context";

const JSON_RPC = { "content-type": "application/json" };

const fail = (status: number, code: number, message: string, extra?: HeadersInit) =>
  new Response(JSON.stringify(rpcError(null, code, message)), {
    status,
    headers: { ...JSON_RPC, ...(extra ?? {}) },
  });

/**
 * MCP エンドポイント。
 *
 * `granted` はトークンに紐づくスコープ。誰がどう検証したかは呼ぶ側の話で、
 * ここは「何をしてよいか」だけを受け取る。
 */
export async function handleMcpRequest(
  request: Request,
  ctx: AppContext,
  granted: readonly string[],
): Promise<Response> {
  // 古い版のクライアントは GET でストリームを開こうとし、DELETE でセッションを
  // 畳もうとする。どちらも今の仕様には無いので、あると伝える（405）。
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "POST" } });
  }

  // DNS rebinding 対策（仕様が MUST と言っている）。遠隔のクライアントは
  // Origin を付けてこないので、**あるときだけ**見る。付いていて他所のものなら断る。
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(request.url).origin) {
    return fail(403, ErrorCode.invalidRequest, "このオリジンからは呼べません");
  }

  let message: JsonRpcMessage;
  try {
    message = JSON.parse(await request.text());
  } catch {
    return fail(400, ErrorCode.parse, "JSON として読めません");
  }
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    return fail(400, ErrorCode.invalidRequest, "JSON-RPC のメッセージを 1 通送ってください");
  }

  const mismatch = headerMismatch(request, message);
  if (mismatch) return fail(400, ErrorCode.headerMismatch, mismatch);

  let response;
  try {
    response = await handleMessage(ctx, granted, message);
  } catch (cause) {
    // スコープ不足は tool の失敗ではなく認可の失敗なので、HTTP の側で返す。
    // 何があれば足りるかを添える（RFC 6750 3.1）。
    if (isAppError(cause) && cause.code === "insufficient_scope") {
      return fail(403, ErrorCode.invalidRequest, cause.message, {
        "www-authenticate": `Bearer error="insufficient_scope", scope="${scopeFor(message)}"`,
      });
    }
    throw cause;
  }

  // 通知には応答を返さない。
  if (response === null) return new Response(null, { status: 202 });

  // 知らない method は 404。古い HTTP+SSE のサーバーと見分けがつくよう、
  // 本文には JSON-RPC のエラーを入れる（仕様の Backward Compatibility）。
  const unknownMethod =
    "error" in response && response.error.code === ErrorCode.methodNotFound;

  return new Response(JSON.stringify(response), {
    status: unknownMethod ? 404 : 200,
    headers: JSON_RPC,
  });

}

/**
 * ヘッダと本文の食い違いを見る。
 *
 * 経路の途中にいるものがヘッダで判断し、サーバーが本文で動くと、**同じ要求が
 * 二通りに読める**。仕様がヘッダの反響と一致検証を要求しているのはそのため。
 *
 * `MCP-Protocol-Version` が無いものは 2025-03-26 以前のクライアントとして
 * 通す。あの頃はヘッダ自体が無かったので、求めると繋がらない。
 */
function headerMismatch(request: Request, message: JsonRpcMessage): string | null {
  const version = request.headers.get("mcp-protocol-version");
  if (!version) return null;

  const meta = (message.params as { _meta?: Record<string, unknown> } | undefined)?._meta;
  const inBody = meta?.["io.modelcontextprotocol/protocolVersion"];
  if (typeof inBody === "string" && inBody !== version) {
    return `MCP-Protocol-Version が本文と食い違っています: ${version} / ${inBody}`;
  }

  const method = request.headers.get("mcp-method");
  if (method !== null && method !== message.method) {
    return `Mcp-Method が本文と食い違っています: ${method} / ${String(message.method)}`;
  }

  const name = decodeHeader(request.headers.get("mcp-name"));
  if (name !== null) {
    const params = (message.params ?? {}) as Record<string, unknown>;
    const inParams = params.name ?? params.uri;
    if (typeof inParams === "string" && name !== inParams) {
      return `Mcp-Name が本文と食い違っています: ${name} / ${inParams}`;
    }
  }

  return null;
}

/**
 * ASCII に収まらない値は `=?base64?…?=` で包まれてくる（仕様の Value Encoding）。
 * 日本語の tool 名を使うつもりは無いが、比較する前に必ず解く決まりになっている。
 */
function decodeHeader(value: string | null): string | null {
  if (value === null) return null;
  const wrapped = /^=\?base64\?(.*)\?=$/.exec(value);
  if (!wrapped) return value;
  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(wrapped[1]), (char) => char.charCodeAt(0)),
    );
  } catch {
    return value;
  }
}

/**
 * 断るときに「何があれば足りるか」を出す（RFC 6750 3.1）。
 *
 * クライアントはこれを見て、足りない分を足した再認可に進める。
 * 実在するスコープ名を返さないと、その道が塞がる。
 */
function scopeFor(message: JsonRpcMessage): string {
  const params = (message.params ?? {}) as Record<string, unknown>;
  const tool = TOOLS.find((candidate) => candidate.name === params.name);
  return tool?.scope ?? "";
}
