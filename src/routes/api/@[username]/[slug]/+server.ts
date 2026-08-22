/** 年表そのもの。読むのは誰でも、直せるのは持ち主だけ。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { timelineView } from "$lib/server/views/timelines";
import { deleteTimeline, updateTimeline } from "$lib/server/actions/timelines";

export const GET: RequestHandler = (event) =>
  json(event, (ctx) => timelineView(ctx, event.params));

export const PATCH: RequestHandler = (event) =>
  json(event, (ctx, input) => updateTimeline(ctx, event.params, input));

export const DELETE: RequestHandler = (event) =>
  json(event, (ctx) => deleteTimeline(ctx, event.params));
