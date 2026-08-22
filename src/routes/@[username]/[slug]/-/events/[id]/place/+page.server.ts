import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { page, submit } from "$lib/server/route";
import { entryRef } from "$lib/server/context";
import { placeView } from "$lib/server/views/entries";
import { placeEntry } from "$lib/server/actions/place";

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => placeView(ctx, entryRef(event.params)));

export const actions: Actions = {
  default: (event) =>
    submit(event, async (ctx, input) => {
      // 載せ先は自分の年表なので、戻るのは元の年表ではなく載せた先。
      const { username, slug } = await placeEntry(ctx, entryRef(event.params), input);
      throw redirect(303, `/@${username}/${slug}`);
    }),
};
