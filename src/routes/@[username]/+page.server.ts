import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { findUserByUsername, listTimelinesByOwner } from "$lib/server/db";
import { requireDb } from "$lib/server/platform";

export const load: PageServerLoad = async ({ platform, params, locals }) => {
  const db = requireDb(platform);

  const owner = await findUserByUsername(db, params.username);
  if (!owner) throw error(404, `@${params.username} は見つかりません`);

  return {
    owner: {
      username: owner.username,
      displayName: owner.display_name,
      avatarUrl: owner.avatar_url,
    },
    timelines: await listTimelinesByOwner(db, owner.id),
    canEdit: locals.user?.id === owner.id,
  };
};
