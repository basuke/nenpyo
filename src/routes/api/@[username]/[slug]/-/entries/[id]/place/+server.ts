/** 他人の年表にある行を、自分の年表にも載せる。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { placeEntry } from "$lib/server/actions/place";
import { entryRef } from "$lib/server/context";

export const POST: RequestHandler = (event) =>
  json(event, (ctx, input) => placeEntry(ctx, entryRef(event.params), input));
