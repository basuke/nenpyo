/**
 * SvelteKit と lib の境目。**翻訳だけをする**。
 *
 * lib の操作（`actions/` と `views/`）は SvelteKit を知らず、失敗はすべて
 * `AppError` で投げてくる。それを HTTP のどの形で返すかは入り口ごとに違う。
 *
 *   フォーム … 書き直せるものは `fail()` でその画面に戻す
 *   ページ   … `error()` でエラーページ
 *   API      … 同じ `AppError` を JSON にする（この隣に入り口を足す）
 *
 * **同じ操作を通って同じ判断で同じエラーになり、違うのは扱いだけ**という形を
 * 保つために、翻訳をここ 1 か所に閉じ込める（docs/004-layers.md）。
 */

import { error, fail, redirect, type ActionFailure, type RequestEvent } from "@sveltejs/kit";
import { forbidden, invalid, isAppError, isRetryable, type AppError } from "./errors";
import { requireDb } from "./platform";
import type { AppContext } from "./context";
import type { RawInput } from "./input";

/**
 * `RequestEvent` から操作の足場を作る。
 *
 * Cookie からユーザーを引くのは `hooks.server.ts` の仕事で、ここに来る頃には
 * `locals.user` に入っている。バインディングの取り出しも HTTP 側の事情なので、
 * lib の中ではなくこの境目でやる。
 */
export function contextOf(event: Pick<RequestEvent, "platform" | "locals">): AppContext {
  return { db: requireDb(event.platform), user: event.locals.user };
}

/** ログイン後に戻ってくる先。クエリまで含めないと、開いていた画面に戻らない。 */
const loginPath = (event: RequestEvent) =>
  `/login?redirect=${encodeURIComponent(event.url.pathname + event.url.search)}`;

/**
 * `load` の入り口。
 *
 * ページには書き直す場所が無いので、`invalid` も `conflict` もエラーページに
 * なる。フォームと違うのはそこだけ。
 */
export async function page<T>(
  event: RequestEvent,
  fn: (ctx: AppContext) => Promise<T> | T,
): Promise<T> {
  try {
    return await fn(contextOf(event));
  } catch (cause) {
    if (!isAppError(cause)) throw cause;
    if (cause.kind === "unauthenticated") throw redirect(303, loginPath(event));
    throw error(cause.status, cause.message);
  }
}

/**
 * フォームの `action` の入り口。
 *
 * `FormData` を plain object にしてから操作へ渡す。検証は操作の中で走るので、
 * ここでするのは**形を揃えること**だけ。API から来る JSON も同じ形になり、
 * 同じ検証を通る。
 *
 * 書き直しで直るもの（`invalid` / `conflict`）は、入力した値ごと画面に戻す。
 * 戻せないものはエラーページ。
 */
export async function submit<T>(
  event: RequestEvent,
  fn: (ctx: AppContext, input: RawInput) => Promise<T>,
): Promise<T | ActionFailure<FormError>> {
  const form = await event.request.formData();
  const input = Object.fromEntries(form) as RawInput;

  try {
    return await fn(contextOf(event), input);
  } catch (cause) {
    if (!isAppError(cause)) throw cause;
    if (cause.kind === "unauthenticated") throw redirect(303, loginPath(event));
    if (isRetryable(cause)) return failWith(cause, input);
    throw error(cause.status, cause.message);
  }
}

/* ── API ──────────────────────────────────────────────────────────────── */

/** API が返すエラー。`code` で分岐させ、`message` は人が読むためのもの。 */
export type JsonError = { error: { code: string | undefined; message: string } };

/**
 * JSON の入り口（docs/006-api.md）。
 *
 * **フォームと同じ操作を呼ぶ。** 違うのは入力を `FormData` ではなく JSON から
 * 取ることと、失敗を画面ではなく JSON で返すことだけ。とくに
 * `unauthenticated` は、画面ではログインへ送るがここでは 401 を返す。
 * 判断は同じで、扱いだけが違う。
 *
 * GET は本体を読まず、クエリ文字列を入力にする。
 */
export async function json<T>(
  event: RequestEvent,
  fn: (ctx: AppContext, input: RawInput) => Promise<T>,
): Promise<Response> {
  try {
    return Response.json(await fn(contextOf(event), await inputOf(event)));
  } catch (cause) {
    if (!isAppError(cause)) throw cause;
    const body: JsonError = { error: { code: cause.code, message: cause.message } };
    return Response.json(body, { status: cause.status });
  }
}

/**
 * 入力を取り出しつつ、Cookie 認証の API が満たすべき条件を確かめる。
 *
 * この API は**同一オリジン専用**。Cookie で誰かを決めているので、他所の
 * ページから叩けてしまうと CSRF になる。塞ぐのは 2 つ。
 *
 *   Origin       … 自分のオリジンからのものだけ通す。**実際に止めているのはこれ**
 *   Content-Type … 本体があるときは `application/json` に限る。`text/plain` は
 *                  preflight を起こさない simple request なので、許すと
 *                  Origin だけが頼りになる。念のための二重化
 *
 * **CORS は開けない。** 開けた瞬間にこの前提が崩れる。
 */
async function inputOf(event: RequestEvent): Promise<RawInput> {
  if (event.request.method === "GET" || event.request.method === "HEAD") {
    return Object.fromEntries(event.url.searchParams);
  }

  const origin = event.request.headers.get("origin");
  if (origin !== event.url.origin) {
    throw forbidden("このオリジンからは呼べません", "bad_origin");
  }

  // 本体が空でもよい。消すときのように、参照だけで足りる操作がある。
  // そのときは Content-Type も求めない。fetch() は本体の無い DELETE に
  // Content-Type を付けないし、送るものが無ければ紛れ込ませるものも無い。
  const text = await event.request.text();
  if (!text.trim()) return {};

  const type = event.request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json")) {
    throw invalid("Content-Type: application/json で送ってください", "bad_content_type");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalid("JSON として読めません", "malformed_json");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalid("JSON のオブジェクトを送ってください", "not_an_object");
  }
  return parsed as RawInput;
}

/**
 * 画面が読む形。`message` を出し、`values` を欄に戻す。
 *
 * `code` も渡しておく。文言で分岐させると直した瞬間に壊れるので、
 * 画面側で「slug がぶつかったときだけ」のような出し分けが要るときはこちらを見る。
 */
export type FormError = { message: string; code: string | undefined; values: RawInput };

function failWith(cause: AppError, values: RawInput): ActionFailure<FormError> {
  return fail(cause.status, { message: cause.message, code: cause.code, values });
}
