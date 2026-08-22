/** 行を足す。`into` に entry の id があれば、その束ねへイベントを 1 件足す。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { addEntry } from "$lib/server/actions/entries";

export const POST: RequestHandler = (event) =>
  json(event, (ctx, input) => addEntry(ctx, event.params, input));
