/** 行そのもの。直すと消す。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { deleteEntry, updateEntry } from "$lib/server/actions/entries";
import { entryRef } from "$lib/server/context";

export const PATCH: RequestHandler = (event) =>
  json(event, (ctx, input) => updateEntry(ctx, entryRef(event.params), input));

export const DELETE: RequestHandler = (event) =>
  json(event, (ctx) => deleteEntry(ctx, entryRef(event.params)));
