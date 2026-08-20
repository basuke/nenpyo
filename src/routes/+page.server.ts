import type { PageServerLoad } from "./$types";
import { listAllTimelines } from "$lib/server/db";
import { requireDb } from "$lib/server/platform";

export const load: PageServerLoad = async ({ platform }) => {
  const db = requireDb(platform);
  return { timelines: await listAllTimelines(db) };
};
