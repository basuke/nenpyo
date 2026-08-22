/**
 * MCP の tool。**画面や API と同じ操作を呼ぶ**（docs/007-mcp.md）。
 *
 * ここに書いてよいのは「どの操作を呼ぶか」と「引数をどう受けるか」だけ。
 * 認可も検証も操作の中で済んでいる（docs/004-layers.md）。MCP は 3 つ目の
 * 入り口でしかない。
 *
 * `@sveltejs/kit` を import しない。ここは HTTP すら知らない。
 */

import { forbidden } from "../errors";
import { entryRef, type AppContext } from "../context";
import * as sql from "../db";
import { addEntry, writeNote } from "../actions/entries";
import { placeEntry } from "../actions/place";
import { timelineView, userView } from "../views/timelines";
import type { RawInput } from "../input";

/**
 * スコープ。**「誰として書くか」ではなく「何をしてよいか」**で切る。
 * ノートは誰が書いても持ち主のものなので（docs/003 5 章、#35）、
 * 誰として振る舞うかは分ける必要がない。
 */
export const SCOPES = ["timeline:read", "note:write", "event:write"] as const;
export type Scope = (typeof SCOPES)[number];

export type Tool = {
  name: string;
  description: string;
  scope: Scope;
  inputSchema: Record<string, unknown>;
  run: (ctx: AppContext, args: RawInput) => Promise<unknown>;
};

/* ── 引数の受け取り ───────────────────────────────────────────────────── */

const str = (args: RawInput, name: string): string =>
  typeof args[name] === "string" ? (args[name] as string) : "";

/** `@` を付けて呼ばれても通す。AI は URL から拾ってくることがある。 */
const username = (args: RawInput) => str(args, "username").replace(/^@/, "");

const timelineRef = (args: RawInput) => ({ username: username(args), slug: str(args, "slug") });

/* ── 型の断片。同じものを 3 回書かない ────────────────────────────────── */

const USERNAME = { type: "string", description: "年表の持ち主。@ は付けても付けなくてもよい" };
const SLUG = { type: "string", description: "年表の slug" };
const ENTRY_ID = { type: "integer", description: "行の id。get_timeline や search_events が返す" };

const TIMELINE_ARGS = {
  type: "object",
  properties: { username: USERNAME, slug: SLUG },
  required: ["username", "slug"],
};

/* ── 読む ─────────────────────────────────────────────────────────────── */

const searchEvents: Tool = {
  name: "search_events",
  description:
    "出来事をタイトルで探す。年表は全部公開なので、誰の年表も横断して返る。" +
    "同じ出来事が複数の年表に載っていれば、その数だけ返る。",
  scope: "timeline:read",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "タイトルに含まれる文字列" },
      limit: { type: "integer", description: "最大件数（既定 20）" },
    },
    required: ["query"],
  },
  run: async (ctx, args) => {
    const limit = Number(args.limit);
    const hits = await sql.searchEvents(
      ctx.db,
      str(args, "query"),
      Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 20,
    );
    return {
      hits: hits.map((hit) => ({
        entryId: hit.entry_id,
        year: hit.year,
        title: hit.title,
        tagline: hit.tagline,
        category: hit.category,
        timeline: {
          username: hit.owner_username,
          slug: hit.timeline_slug,
          title: hit.timeline_title,
        },
      })),
    };
  },
};

const listTimelines: Tool = {
  name: "list_timelines",
  description:
    "その人の年表を一覧する。username を省くと、呼んでいる本人の年表になる。" +
    "他の tool は username と slug で年表を指すので、まずここで名前を知る。",
  scope: "timeline:read",
  inputSchema: {
    type: "object",
    properties: { username: USERNAME },
  },
  run: async (ctx, args) => {
    const who = username(args) || ctx.user?.username || "";
    const view = await userView(ctx, who);
    return {
      username: view.owner.username,
      timelines: view.timelines.map((t) => ({
        slug: t.slug,
        title: t.title,
        description: t.description,
        entryCount: t.entryCount,
      })),
    };
  },
};

const getTimeline: Tool = {
  name: "get_timeline",
  description: "年表を読む。年ごとにまとまった行が返る。行の id は書き込み系の tool に渡す。",
  scope: "timeline:read",
  inputSchema: TIMELINE_ARGS,
  run: async (ctx, args) => {
    const view = await timelineView(ctx, timelineRef(args));
    return {
      timeline: view.timeline,
      owner: view.owner,
      entryCount: view.entryCount,
      years: view.years.map((group) => ({
        year: group.year,
        entries: group.entries.map((entry) => ({
          entryId: entry.id,
          titles: entry.events.map((event) => event.title),
          tagline: entry.note?.tagline ?? null,
          body: entry.note?.body ?? null,
          owner: entry.author?.username ?? null,
        })),
      })),
    };
  },
};

/* ── 書く ─────────────────────────────────────────────────────────────── */

const writeNoteTool: Tool = {
  name: "write_note",
  description:
    "既にある行に見方を付ける（キャッチコピーと説明）。事実には触らない。" +
    "書いたものはその年表の持ち主のものになる。空にすると消える。",
  scope: "note:write",
  inputSchema: {
    type: "object",
    properties: {
      username: USERNAME,
      slug: SLUG,
      entryId: ENTRY_ID,
      tagline: { type: "string", description: "ひとことの言い回し。100 文字まで" },
      body: { type: "string", description: "説明" },
    },
    required: ["username", "slug", "entryId"],
  },
  run: (ctx, args) => writeNote(ctx, entryRefOf(args), args),
};

const addEvent: Tool = {
  name: "add_event",
  description:
    "年表に出来事を足す。into に行の id を渡すと、新しい行ではなくその束ねに足す。" +
    "**事実を書くので、links に出典を添えること。**",
  scope: "event:write",
  inputSchema: {
    type: "object",
    properties: {
      username: USERNAME,
      slug: SLUG,
      year: { type: "integer", description: "西暦。紀元前は負の数" },
      title: { type: "string", description: "何が起きたか。見方ではなく事実だけ" },
      tagline: { type: "string", description: "見方をひとことで。100 文字まで" },
      body: { type: "string", description: "説明" },
      category: { type: "string", description: "分類（省略可）" },
      subcategory: { type: "string", description: "小分類（省略可）" },
      links: { type: "string", description: "出典。1 行に 1 本" },
      into: { type: "integer", description: "束ねに足すときの行の id" },
    },
    required: ["username", "slug", "year", "title"],
  },
  run: (ctx, args) => addEntry(ctx, timelineRef(args), args),
};

const placeEntryTool: Tool = {
  name: "place_entry",
  description:
    "他人の年表にある行を、自分の年表にも載せる。出来事は複製されず、両方の年表が" +
    "同じ行を指す。note に share を渡すと元のノートをそのまま参照する。",
  // 事実を作りはしないが、年表に載る行が増えるので event:write の側に置く。
  scope: "event:write",
  inputSchema: {
    type: "object",
    properties: {
      username: { ...USERNAME, description: "載せる元の年表の持ち主" },
      slug: { ...SLUG, description: "載せる元の年表の slug" },
      entryId: ENTRY_ID,
      timelineId: { type: "integer", description: "載せ先の年表の id（自分のもの）" },
      note: {
        type: "string",
        enum: ["share", "own", "none"],
        description: "元のノートを参照する / 自分で書く / 付けない",
      },
      tagline: { type: "string", description: "note が own のとき" },
      body: { type: "string", description: "note が own のとき" },
    },
    required: ["username", "slug", "entryId", "timelineId"],
  },
  run: (ctx, args) => placeEntry(ctx, entryRefOf(args), args),
};

function entryRefOf(args: RawInput) {
  return entryRef({
    username: username(args),
    slug: str(args, "slug"),
    id: String(args.entryId ?? ""),
  });
}

/* ── 目録 ─────────────────────────────────────────────────────────────── */

export const TOOLS: Tool[] = [
  searchEvents,
  listTimelines,
  getTimeline,
  writeNoteTool,
  addEvent,
  placeEntryTool,
];

/**
 * そのトークンで使える tool だけを返す。
 *
 * 使えないものを目録に出すと、AI が呼んでから断られることになる。
 * **できないことは見せない**ほうが、無駄な往復が減る。
 */
export const toolsFor = (granted: readonly string[]): Tool[] =>
  TOOLS.filter((tool) => granted.includes(tool.scope));

/** 権限が足りないときは、何があれば足りるかを添えて断る（RFC 6750 3.1）。 */
export function requireScope(tool: Tool, granted: readonly string[]): void {
  if (!granted.includes(tool.scope)) {
    throw forbidden(`${tool.name} には ${tool.scope} が要ります`, "insufficient_scope");
  }
}
