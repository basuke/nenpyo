import type { PageServerLoad } from "./$types";
import { page } from "$lib/server/route";
import { homeView } from "$lib/server/views/timelines";

export const load: PageServerLoad = (event) => page(event, homeView);
