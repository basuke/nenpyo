import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { page, submit } from "$lib/server/route";
import { entryRef } from "$lib/server/context";
import { mergeView } from "$lib/server/views/entries";
import { mergeEntries } from "$lib/server/actions/bundles";

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => mergeView(ctx, entryRef(event.params), event.url.searchParams.get("with")));

export const actions: Actions = {
  default: (event) =>
    submit(event, async (ctx, input) => {
      const { username, slug } = await mergeEntries(ctx, entryRef(event.params), input);
      throw redirect(303, `/@${username}/${slug}`);
    }),
};
