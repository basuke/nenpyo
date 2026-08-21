import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { page, submit } from "$lib/server/route";
import { newEntryView } from "$lib/server/views/entries";
import { addEntry } from "$lib/server/actions/entries";

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => newEntryView(ctx, event.params, event.url.searchParams.get("into")));

export const actions: Actions = {
  default: (event) =>
    submit(event, async (ctx, input) => {
      const { entryId, bundled } = await addEntry(ctx, event.params, input);
      const base = `/@${event.params.username}/${event.params.slug}`;

      // 束ねに足したときは、並びを直したいことが多いのでその行の編集へ戻す。
      throw redirect(303, bundled ? `${base}/-/events/${entryId}/edit` : base);
    }),
};
