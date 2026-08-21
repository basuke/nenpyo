import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { page, submit } from "$lib/server/route";
import { mergeView } from "$lib/server/views/entries";
import { mergeEntries } from "$lib/server/actions/bundles";

const ref = (params: { username: string; slug: string; id: string }) => ({
  username: params.username,
  slug: params.slug,
  entryId: params.id,
});

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => mergeView(ctx, ref(event.params), event.url.searchParams.get("with")));

export const actions: Actions = {
  default: (event) =>
    submit(event, async (ctx, input) => {
      const { username, slug } = await mergeEntries(ctx, ref(event.params), input);
      throw redirect(303, `/@${username}/${slug}`);
    }),
};
