import type { PageServerLoad } from "./$types";
import { page } from "$lib/server/route";
import { userView } from "$lib/server/views/timelines";

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => userView(ctx, event.params.username));
