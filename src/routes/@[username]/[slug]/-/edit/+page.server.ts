import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { page, submit } from "$lib/server/route";
import { timelineEditView } from "$lib/server/views/timelines";
import { deleteTimeline, updateTimeline } from "$lib/server/actions/timelines";

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => timelineEditView(ctx, event.params));

export const actions: Actions = {
  save: (event) =>
    submit(event, async (ctx, input) => {
      const { username, slug } = await updateTimeline(ctx, event.params, input);
      throw redirect(303, `/@${username}/${slug}`);
    }),

  delete: (event) =>
    submit(event, async (ctx) => {
      const { username } = await deleteTimeline(ctx, event.params);
      throw redirect(303, `/@${username}`);
    }),
};
