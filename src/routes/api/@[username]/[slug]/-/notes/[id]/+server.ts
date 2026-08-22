/** ノートの歴代。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { noteHistoryView } from "$lib/server/views/notes";

export const GET: RequestHandler = (event) =>
  json(event, (ctx) => noteHistoryView(ctx, event.params, event.params.id));
