import type { Handle } from "@sveltejs/kit";
import { SESSION_COOKIE, resolveSession } from "$lib/server/auth";

export const handle: Handle = async ({ event, resolve }) => {
  const db = event.platform?.env?.DB;
  const sessionId = event.cookies.get(SESSION_COOKIE);

  event.locals.user = db && sessionId ? await resolveSession(db, sessionId) : null;

  return resolve(event);
};
