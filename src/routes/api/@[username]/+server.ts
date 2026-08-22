/** その人の年表一覧。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { userView } from "$lib/server/views/timelines";

export const GET: RequestHandler = (event) =>
  json(event, (ctx) => userView(ctx, event.params.username));
