import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { page, submit } from "$lib/server/route";
import { editEntryView } from "$lib/server/views/entries";
import { deleteEntry, updateEntry } from "$lib/server/actions/entries";
import { detachEvent, reorderEvents } from "$lib/server/actions/bundles";

const ref = (params: { username: string; slug: string; id: string }) => ({
  username: params.username,
  slug: params.slug,
  entryId: params.id,
});

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => editEntryView(ctx, ref(event.params)));

export const actions: Actions = {
  save: (event) =>
    submit(event, async (ctx, input) => {
      const { username, slug } = await updateEntry(ctx, ref(event.params), input);
      throw redirect(303, `/@${username}/${slug}`);
    }),

  detach: (event) =>
    submit(event, async (ctx, input) => {
      await detachEvent(ctx, ref(event.params), input);
      // 切り離した直後は両方が同じノートを指している。元の行に留まって直せるようにする。
      return { detached: true };
    }),

  reorder: (event) =>
    submit(event, async (ctx, input) => {
      await reorderEvents(ctx, ref(event.params), input);
      return { reordered: true };
    }),

  delete: (event) =>
    submit(event, async (ctx) => {
      const { username, slug } = await deleteEntry(ctx, ref(event.params));
      throw redirect(303, `/@${username}/${slug}`);
    }),
};
