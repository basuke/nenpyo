/** 束ねからイベントを 1 件外して、独立した行にする。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { detachEvent } from "$lib/server/actions/bundles";
import { entryRef } from "$lib/server/context";

export const POST: RequestHandler = (event) =>
  json(event, async (ctx, input) => {
    await detachEvent(ctx, entryRef(event.params), input);
    // 切り離した直後は両方の行が同じノートを指している。呼んだ側に伝える。
    return { detached: true, noteShared: true };
  });
