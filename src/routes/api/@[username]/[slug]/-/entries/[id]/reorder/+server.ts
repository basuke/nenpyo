/** 束ねの中の並びを 1 つ動かす。先頭が年表上の位置を決める。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { reorderEvents } from "$lib/server/actions/bundles";
import { entryRef } from "$lib/server/context";

export const POST: RequestHandler = (event) =>
  json(event, async (ctx, input) => {
    await reorderEvents(ctx, entryRef(event.params), input);
    return { reordered: true };
  });
