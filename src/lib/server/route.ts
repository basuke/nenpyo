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
 *
 * API を足すときはこのファイルに `json(event, fn)` を並べる。中身は
 * `catch (cause) { if (isAppError(cause)) return Response.json(
 *   { error: { code: cause.code, message: cause.message } }, { status: cause.status } ) }`
 * で、操作そのものには一切触らない。
 */

import { error, fail, redirect, type ActionFailure, type RequestEvent } from "@sveltejs/kit";
import { isAppError, isRetryable, type AppError } from "./errors";
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
