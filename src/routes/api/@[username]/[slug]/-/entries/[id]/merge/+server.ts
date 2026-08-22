/** 2 つの行を 1 つに束ねる。どちらのノートを採るかは入力で決める。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { mergeEntries } from "$lib/server/actions/bundles";
import { entryRef } from "$lib/server/context";

export const POST: RequestHandler = (event) =>
  json(event, (ctx, input) => mergeEntries(ctx, entryRef(event.params), input));
