/** 全部の年表。年表は誰でも読めるので、ここも認証は要らない。 */

import type { RequestHandler } from "./$types";
import { json } from "$lib/server/route";
import { homeView } from "$lib/server/views/timelines";

export const GET: RequestHandler = (event) => json(event, homeView);
