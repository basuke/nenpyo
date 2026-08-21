/**
 * lib が投げる唯一のエラー型。
 *
 * `actions/` と `views/` は SvelteKit を知らない。`error()` も `redirect()` も
 * `fail()` も呼ばず、失敗はすべて `AppError` にする。それを HTTP のどの形で
 * 返すかは入り口ごとに違う（画面ならフォームに戻す、API なら JSON）ので、
 * 翻訳は `route.ts` に閉じ込める（docs/004-layers.md）。
 *
 * こうしておくと、同じ操作を UI から呼んでも API から呼んでも**同じ判断で
 * 同じエラーになり、違うのはその見せ方だけ**になる。
 */

/**
 * 失敗の種類。HTTP の status はここから決まるが、**種類のほうが先**。
 * 「入力が正しくない」は 400 だから invalid なのではなく、
 * invalid だから 400 になる。
 */
export type ErrorKind =
  /** 入力が正しくない。フォームなら書き直せる */
  | "invalid"
  /** ログインしていない。画面ならログインへ送る */
  | "unauthenticated"
  /** ログインはしているが、その人には許されていない */
  | "forbidden"
  /** 指しているものが無い */
  | "notFound"
  /** 今の状態と衝突している。slug の重複、載せ先に既にある、など */
  | "conflict";

const STATUS: Record<ErrorKind, number> = {
  invalid: 400,
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
};

/**
 * `kind` は分岐用、`message` は人が読む日本語、`code` は機械が読む識別子。
 *
 * message を API のクライアントに分岐させると、文言を直した瞬間に壊れる。
 * 分岐させたいものには code を付ける。
 */
export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly code: string | undefined;

  constructor(kind: ErrorKind, message: string, code?: string) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.code = code;
  }

  get status(): number {
    return STATUS[this.kind];
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/**
 * 入力の書き直しで直るものは `invalid` と `conflict` の 2 つだけ。
 * フォームの入り口はこれを見て `fail()` に落とす（route.ts）。
 */
export function isRetryable(error: AppError): boolean {
  return error.kind === "invalid" || error.kind === "conflict";
}

/* ── 投げる側のための短縮形 ───────────────────────────────────────────── */

export const invalid = (message: string, code?: string) =>
  new AppError("invalid", message, code);

export const unauthenticated = (message = "ログインしてください", code?: string) =>
  new AppError("unauthenticated", message, code);

export const forbidden = (message: string, code?: string) =>
  new AppError("forbidden", message, code);

export const notFound = (message: string, code?: string) =>
  new AppError("notFound", message, code);

export const conflict = (message: string, code?: string) =>
  new AppError("conflict", message, code);
