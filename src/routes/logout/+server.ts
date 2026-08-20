import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { SESSION_COOKIE, clearSessionCookie, destroySession } from "$lib/server/auth";

// GET ではなく POST。リンクを踏ませるだけでログアウトさせられないようにする。
export const POST: RequestHandler = async ({ cookies, platform }) => {
  const sessionId = cookies.get(SESSION_COOKIE);
  const db = platform?.env?.DB;

  if (sessionId && db) await destroySession(db, sessionId);
  clearSessionCookie(cookies);

  throw redirect(303, "/");
};
