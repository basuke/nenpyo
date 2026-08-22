/**
 * 年表を作る。
 *
 * `/-/` はアプリ機能側の目印（docs/001-mvp.md 5 章）。これが無いと
 * `timelines` という slug の年表と衝突する。
 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { createTimeline } from "$lib/server/actions/timelines";

export const POST: RequestHandler = (event) =>
  json(event, (ctx, input) => createTimeline(ctx, event.params.username, input));
