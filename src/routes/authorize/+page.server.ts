import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { page, submit } from "$lib/server/route";
import { authorizeView, approveAuthorization } from "$lib/server/views/authorize";

export const load: PageServerLoad = (event) =>
  page(event, (ctx) => authorizeView(ctx, event.request, oauthOf(event)));

export const actions: Actions = {
  default: (event) =>
    submit(event, async (ctx, input) => {
      const { redirectTo } = await approveAuthorization(ctx, event.request, oauthOf(event), input);
      throw redirect(303, redirectTo);
    }),
};

/**
 * OAuthProvider が注入する helper。Worker の包み（worker/index.ts）が
 * 立てているので、SvelteKit からはバインディングとして見える。
 */
const oauthOf = (event: { platform?: Readonly<App.Platform> }) =>
  event.platform!.env.OAUTH_PROVIDER;
