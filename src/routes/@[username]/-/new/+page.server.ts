import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { page, submit } from "$lib/server/route";
import { newTimelineView } from "$lib/server/views/timelines";
import { createTimeline } from "$lib/server/actions/timelines";

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => newTimelineView(ctx, event.params.username));

export const actions: Actions = {
  default: (event) =>
    submit(event, async (ctx, input) => {
      const { username, slug } = await createTimeline(ctx, event.params.username, input);
      throw redirect(303, `/@${username}/${slug}`);
    }),
};
