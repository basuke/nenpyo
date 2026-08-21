import type { PageServerLoad } from "./$types";
import { page } from "$lib/server/route";
import { noteHistoryView } from "$lib/server/views/notes";

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => noteHistoryView(ctx, event.params, event.params.id));
