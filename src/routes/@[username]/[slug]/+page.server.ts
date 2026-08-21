import type { PageServerLoad } from "./$types";
import { page } from "$lib/server/route";
import { timelineView } from "$lib/server/views/timelines";

// 読むだけのページなので、クライアント側では何もしない。
// 有効にしておくと 720 件分のデータがハイドレーション用の JSON として
// 本文と二重に載り、転送量がそのまま倍になる。
export const csr = false;

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => timelineView(ctx, event.params));
