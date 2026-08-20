import { error, redirect } from "@sveltejs/kit";
import { findTimeline, findUserByUsername } from "./db";
import { requireDb, type MaybePlatform } from "./platform";
import type { SessionUser } from "./auth";

/** 閲覧は誰でも可能。オーナーかどうかだけ添えて返す。 */
export async function loadTimelineContext(
  platform: MaybePlatform,
  params: { username: string; slug: string },
  user: SessionUser | null,
) {
  const db = requireDb(platform);

  const owner = await findUserByUsername(db, params.username);
  if (!owner) throw error(404, `@${params.username} は見つかりません`);

  const timeline = await findTimeline(db, owner.id, params.slug);
  if (!timeline) throw error(404, `@${params.username}/${params.slug} は見つかりません`);

  return { db, owner, timeline, canEdit: user?.id === owner.id };
}

/** 編集系のページ・アクション用。未ログインはログインへ、他人は 403。 */
export function requireOwner(
  user: SessionUser | null,
  ownerId: number,
  currentPath: string,
): SessionUser {
  if (!user) throw redirect(303, `/login?redirect=${encodeURIComponent(currentPath)}`);
  if (user.id !== ownerId) throw error(403, "他人のタイムラインは編集できません");
  return user;
}

/** ユーザーを引いて、編集権限を確かめる。 */
export async function requireOwnUser(
  platform: MaybePlatform,
  username: string,
  user: SessionUser | null,
  currentPath: string,
) {
  const db = requireDb(platform);

  const owner = await findUserByUsername(db, username);
  if (!owner) throw error(404, `@${username} は見つかりません`);

  requireOwner(user, owner.id, currentPath);
  return { db, owner };
}
