/**
 * D1 への問い合わせ。ORM は入れず生 SQL で書く（docs/001-mvp.md 3 章）。
 *
 * 「後から構造を変える前提」であるぶん、SQLite の挙動がそのまま見えている
 * ほうが判断しやすい。行の型はここで手書きして持つ。
 */

export type UserRow = {
  id: number;
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type TimelineRow = {
  id: number;
  owner_id: number;
  slug: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

/** 一覧に出すとき、オーナーの表示に必要な分だけ結合したもの。 */
export type TimelineWithOwner = TimelineRow & {
  owner_username: string;
  owner_display_name: string | null;
  owner_avatar_url: string | null;
  event_count: number;
};

export type EventRow = {
  id: number;
  timeline_id: number;
  year: number;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  precision: string;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  links: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

export function now(): string {
  return new Date().toISOString();
}

// 並び順: year → month → day → hour → minute → id の昇順。
// 下位の値が NULL の行は SQLite の既定で先頭に来るので、
// 「下位の値が空のものはその区切りの先頭」という要件とそのまま一致する。
const EVENT_ORDER = "ORDER BY year ASC, month ASC, day ASC, hour ASC, minute ASC, id ASC";

const TIMELINE_WITH_OWNER = `
  SELECT t.*,
         u.username      AS owner_username,
         u.display_name  AS owner_display_name,
         u.avatar_url    AS owner_avatar_url,
         (SELECT COUNT(*) FROM events e WHERE e.timeline_id = t.id) AS event_count
    FROM timelines t
    JOIN users u ON u.id = t.owner_id
`;

/* ── users ────────────────────────────────────────────────────────────── */

export async function findUserByUsername(db: D1Database, username: string) {
  return db
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .bind(username)
    .first<UserRow>();
}

export async function findUserByGithubId(db: D1Database, githubId: number) {
  return db.prepare("SELECT * FROM users WHERE github_id = ?").bind(githubId).first<UserRow>();
}

/**
 * ログインのたびに GitHub の最新値で更新する。
 * 一致させるのは github_id（不変キー）で、username は変わりうる可変フィールド。
 * 本人のログイン前に作っておいた行も、ここで自然に本人のものになる。
 */
export async function upsertUserFromGithub(
  db: D1Database,
  profile: { githubId: number; username: string; displayName: string | null; avatarUrl: string | null },
): Promise<UserRow> {
  await db
    .prepare(
      `INSERT INTO users (github_id, username, display_name, avatar_url, updated_at)
            VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (github_id) DO UPDATE SET
            username     = excluded.username,
            display_name = excluded.display_name,
            avatar_url   = excluded.avatar_url,
            updated_at   = excluded.updated_at`,
    )
    .bind(profile.githubId, profile.username, profile.displayName, profile.avatarUrl, now())
    .run();

  const user = await findUserByGithubId(db, profile.githubId);
  if (!user) throw new Error(`user disappeared right after upsert: ${profile.githubId}`);
  return user;
}

export async function isAllowedToSignIn(db: D1Database, githubId: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM allowed_github_ids WHERE github_id = ?")
    .bind(githubId)
    .first<{ ok: number }>();
  return row !== null;
}

/* ── timelines ────────────────────────────────────────────────────────── */

export async function listAllTimelines(db: D1Database, limit = 100) {
  const { results } = await db
    .prepare(`${TIMELINE_WITH_OWNER} ORDER BY t.updated_at DESC LIMIT ?`)
    .bind(limit)
    .all<TimelineWithOwner>();
  return results;
}

export async function listTimelinesByOwner(db: D1Database, ownerId: number) {
  const { results } = await db
    .prepare(`${TIMELINE_WITH_OWNER} WHERE t.owner_id = ? ORDER BY t.updated_at DESC`)
    .bind(ownerId)
    .all<TimelineWithOwner>();
  return results;
}

export async function findTimeline(db: D1Database, ownerId: number, slug: string) {
  return db
    .prepare(`${TIMELINE_WITH_OWNER} WHERE t.owner_id = ? AND t.slug = ?`)
    .bind(ownerId, slug)
    .first<TimelineWithOwner>();
}

export async function createTimeline(
  db: D1Database,
  input: { ownerId: number; slug: string; title: string; description: string | null },
) {
  return db
    .prepare(
      `INSERT INTO timelines (owner_id, slug, title, description)
            VALUES (?, ?, ?, ?)
         RETURNING *`,
    )
    .bind(input.ownerId, input.slug, input.title, input.description)
    .first<TimelineRow>();
}

export async function updateTimeline(
  db: D1Database,
  id: number,
  input: { slug: string; title: string; description: string | null },
) {
  return db
    .prepare(
      `UPDATE timelines
          SET slug = ?, title = ?, description = ?, updated_at = ?
        WHERE id = ?
    RETURNING *`,
    )
    .bind(input.slug, input.title, input.description, now(), id)
    .first<TimelineRow>();
}

export async function deleteTimeline(db: D1Database, id: number) {
  // events は ON DELETE CASCADE で落ちる。削除は物理削除（docs/001-mvp.md 7 章）。
  await db.prepare("DELETE FROM timelines WHERE id = ?").bind(id).run();
}

/**
 * 一覧が updated_at 降順なので、配下のイベントが動いたらここも動かす。
 * これを忘れると並びが機能しなくなる。
 */
export async function touchTimeline(db: D1Database, id: number) {
  await db.prepare("UPDATE timelines SET updated_at = ? WHERE id = ?").bind(now(), id).run();
}

/* ── events ───────────────────────────────────────────────────────────── */

export async function listEvents(db: D1Database, timelineId: number) {
  const { results } = await db
    .prepare(`SELECT * FROM events WHERE timeline_id = ? ${EVENT_ORDER}`)
    .bind(timelineId)
    .all<EventRow>();
  return results;
}

export async function findEvent(db: D1Database, timelineId: number, id: number) {
  return db
    .prepare("SELECT * FROM events WHERE id = ? AND timeline_id = ?")
    .bind(id, timelineId)
    .first<EventRow>();
}

export type EventInput = {
  year: number;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  links: string | null;
};

export async function createEvent(
  db: D1Database,
  timelineId: number,
  createdBy: number,
  input: EventInput,
) {
  const event = await db
    .prepare(
      `INSERT INTO events (timeline_id, year, precision, title, description, category, subcategory, links, created_by)
            VALUES (?, ?, 'year', ?, ?, ?, ?, ?, ?)
         RETURNING *`,
    )
    .bind(
      timelineId,
      input.year,
      input.title,
      input.description,
      input.category,
      input.subcategory,
      input.links,
      createdBy,
    )
    .first<EventRow>();

  await touchTimeline(db, timelineId);
  return event;
}

export async function updateEvent(
  db: D1Database,
  timelineId: number,
  id: number,
  input: EventInput,
) {
  const event = await db
    .prepare(
      `UPDATE events
          SET year = ?, title = ?, description = ?, category = ?, subcategory = ?, links = ?, updated_at = ?
        WHERE id = ? AND timeline_id = ?
    RETURNING *`,
    )
    .bind(
      input.year,
      input.title,
      input.description,
      input.category,
      input.subcategory,
      input.links,
      now(),
      id,
      timelineId,
    )
    .first<EventRow>();

  await touchTimeline(db, timelineId);
  return event;
}

export async function deleteEvent(db: D1Database, timelineId: number, id: number) {
  await db.prepare("DELETE FROM events WHERE id = ? AND timeline_id = ?").bind(id, timelineId).run();
  await touchTimeline(db, timelineId);
}

/** そのタイムラインで実際に使われているカテゴリ。入力フォームの候補に使う。 */
export async function listUsedCategories(db: D1Database, timelineId: number) {
  const { results } = await db
    .prepare(
      `SELECT category, subcategory, COUNT(*) AS count
         FROM events
        WHERE timeline_id = ?
     GROUP BY category, subcategory
     ORDER BY count DESC`,
    )
    .bind(timelineId)
    .all<{ category: string | null; subcategory: string | null; count: number }>();
  return results;
}
