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
  entry_count: number;
};

/**
 * 客観の核。「いつ・何が起きたか」だけを持ち、ノートは持たない。
 * どの年表に載るかは timeline_entries 経由で決まる（docs/003-events-and-notes.md）。
 */
export type EventRow = {
  id: number;
  year: number;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  precision: string;
  title: string;
  category: string | null;
  subcategory: string | null;
  links: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * 属人のノート。tagline がキャッチコピー、body がこれまでの description。
 * 同じ出来事に何本あってもよく、どれを採るかは年表側が決める。
 */
export type NoteRow = {
  id: number;
  author_id: number | null;
  tagline: string | null;
  body: string | null;
  links: string | null;
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
         (SELECT COUNT(*) FROM timeline_entries te WHERE te.timeline_id = t.id) AS entry_count
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
  // timeline_entries と、その繋ぎが ON DELETE CASCADE で落ちる。events と notes は
  // 素材なので残る。どこからも参照されなくなったものの回収は deleteEntry 側で行う。
  await db.prepare("DELETE FROM timelines WHERE id = ?").bind(id).run();
}

/**
 * 一覧が updated_at 降順なので、配下の行が動いたらここも動かす。
 * これを忘れると並びが機能しなくなる。
 */
export async function touchTimeline(db: D1Database, id: number) {
  await db.prepare("UPDATE timelines SET updated_at = ? WHERE id = ?").bind(now(), id).run();
}

/* ── entries ──────────────────────────────────────────────────────────── */

/**
 * 年表の 1 行。読む側はつねにここを通り、events を直に並べない
 * （docs/003-events-and-notes.md）。
 *
 * events が 1..N なのは束ね（compound）を同じ仕組みで表すため。単独の
 * イベントは要素数 1 の束ねとして扱うので、この型に分岐は要らない。
 */
export type TimelineEntry = {
  id: number;
  position: number;
  note: NoteRow | null;
  events: EventRow[];
};

// 並びは代表イベント（position 0）の日付で決まる。position は同着をほぐすためだけ。
const ENTRY_ORDER =
  "ORDER BY ev.year ASC, ev.month ASC, ev.day ASC, ev.hour ASC, ev.minute ASC, te.position ASC, te.id ASC";

type EntryHeadRow = { id: number; position: number } & {
  [K in keyof NoteRow as `note_${string & K}`]: NoteRow[K] | null;
};

/**
 * 1 本の年表を読む。
 *
 * entry と、それが指すイベントを 2 回に分けて引く。1 本の JOIN で済ませると
 * 束ねの数だけ entry 側の列が重複して返るので、並び順の決定と本体の取得を
 * 分けている。
 */
export async function listEntries(db: D1Database, timelineId: number): Promise<TimelineEntry[]> {
  const heads = await db
    .prepare(
      `SELECT te.id, te.position,
              n.id          AS note_id,
              n.author_id   AS note_author_id,
              n.tagline     AS note_tagline,
              n.body        AS note_body,
              n.links       AS note_links,
              n.created_at  AS note_created_at,
              n.updated_at  AS note_updated_at
         FROM timeline_entries te
         JOIN timeline_entry_events tee ON tee.entry_id = te.id AND tee.position = 0
         JOIN events ev ON ev.id = tee.event_id
    LEFT JOIN notes n ON n.id = te.note_id
        WHERE te.timeline_id = ?
        ${ENTRY_ORDER}`,
    )
    .bind(timelineId)
    .all<EntryHeadRow>();

  const members = await db
    .prepare(
      `SELECT tee.entry_id, ev.*
         FROM timeline_entry_events tee
         JOIN timeline_entries te ON te.id = tee.entry_id
         JOIN events ev ON ev.id = tee.event_id
        WHERE te.timeline_id = ?
     ORDER BY tee.entry_id ASC, tee.position ASC`,
    )
    .bind(timelineId)
    .all<EventRow & { entry_id: number }>();

  const byEntry = new Map<number, EventRow[]>();
  for (const { entry_id, ...event } of members.results) {
    const list = byEntry.get(entry_id);
    if (list) list.push(event);
    else byEntry.set(entry_id, [event]);
  }

  return heads.results.map((head) => ({
    id: head.id,
    position: head.position,
    note: toNote(head),
    events: byEntry.get(head.id) ?? [],
  }));
}

/** LEFT JOIN で引いた note_* 列を NoteRow に戻す。note が無ければ null。 */
function toNote(head: EntryHeadRow): NoteRow | null {
  if (head.note_id === null) return null;
  return {
    id: head.note_id,
    author_id: head.note_author_id,
    tagline: head.note_tagline,
    body: head.note_body,
    links: head.note_links,
    created_at: head.note_created_at as string,
    updated_at: head.note_updated_at as string,
  };
}

export async function findEntry(db: D1Database, timelineId: number, id: number) {
  // 件数が小さいので一覧を引いて絞る。entry 単体を組み立てる SQL を
  // もう一本持つより、読む経路が 1 本のほうが崩れにくい。
  const entries = await listEntries(db, timelineId);
  return entries.find((entry) => entry.id === id) ?? null;
}

/* ── entries の書き込み ───────────────────────────────────────────────── */

export type EntryInput = {
  year: number;
  title: string;
  tagline: string | null;
  body: string | null;
  category: string | null;
  subcategory: string | null;
  links: string | null;
};

/**
 * 1 行ぶんを丸ごと作る。event と note と entry と、その繋ぎを 1 組で置く。
 *
 * event の id が要るので順に書いていて、途中で失敗すると孤児が残りうる。
 * 参照の無い event / note は誰からも見えず、次の削除で回収されるので
 * MVP では許している。
 */
export async function createEntry(
  db: D1Database,
  timelineId: number,
  authorId: number,
  input: EntryInput,
): Promise<number> {
  const event = await db
    .prepare(
      `INSERT INTO events (year, precision, title, category, subcategory, links, created_by)
            VALUES (?, 'year', ?, ?, ?, ?, ?)
         RETURNING id`,
    )
    .bind(input.year, input.title, input.category, input.subcategory, input.links, authorId)
    .first<{ id: number }>();
  if (!event) throw new Error("failed to insert event");

  const note = await db
    .prepare(
      `INSERT INTO notes (author_id, tagline, body)
            VALUES (?, ?, ?)
         RETURNING id`,
    )
    .bind(authorId, input.tagline, input.body)
    .first<{ id: number }>();
  if (!note) throw new Error("failed to insert note");

  const entry = await db
    .prepare(
      `INSERT INTO timeline_entries (timeline_id, note_id)
            VALUES (?, ?)
         RETURNING id`,
    )
    .bind(timelineId, note.id)
    .first<{ id: number }>();
  if (!entry) throw new Error("failed to insert timeline entry");

  await db
    .prepare("INSERT INTO timeline_entry_events (entry_id, event_id, position) VALUES (?, ?, 0)")
    .bind(entry.id, event.id)
    .run();

  await touchTimeline(db, timelineId);
  return entry.id;
}

/**
 * 代表イベントと note を書き換える。
 *
 * ここは自分の年表の自分の行を直す経路なので、複製は起こさない。他人の
 * event / note を直そうとしたときに複製する Copy on Write は、引用の仕組みを
 * 入れるときに足す（docs/003 の 5 章、Issue #11）。
 */
export async function updateEntry(
  db: D1Database,
  timelineId: number,
  entry: TimelineEntry,
  input: EntryInput,
) {
  const event = entry.events[0];
  if (!event) throw new Error(`entry ${entry.id} has no event`);

  await db
    .prepare(
      `UPDATE events
          SET year = ?, title = ?, category = ?, subcategory = ?, links = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(input.year, input.title, input.category, input.subcategory, input.links, now(), event.id)
    .run();

  if (entry.note) {
    await db
      .prepare("UPDATE notes SET tagline = ?, body = ?, updated_at = ? WHERE id = ?")
      .bind(input.tagline, input.body, now(), entry.note.id)
      .run();
  } else if (input.tagline || input.body) {
    // ノートが無かった行に、初めてノートが付いた。
    const note = await db
      .prepare("INSERT INTO notes (author_id, tagline, body) VALUES (?, ?, ?) RETURNING id")
      .bind(event.created_by, input.tagline, input.body)
      .first<{ id: number }>();
    if (note) {
      await db
        .prepare("UPDATE timeline_entries SET note_id = ?, updated_at = ? WHERE id = ?")
        .bind(note.id, now(), entry.id)
        .run();
    }
  }

  await touchTimeline(db, timelineId);
}

/**
 * 年表から 1 行を外す。
 *
 * entry はその年表のものなので必ず消える。event と note は素材で、他の年表が
 * 参照しているかもしれないので、どこからも到達できなくなったものだけを回収する
 * （docs/003 の 6 章）。参照が残っていれば消さずに置いていく。
 */
export async function deleteEntry(db: D1Database, timelineId: number, entry: TimelineEntry) {
  // timeline_entry_events は ON DELETE CASCADE で落ちる。
  await db.prepare("DELETE FROM timeline_entries WHERE id = ?").bind(entry.id).run();

  for (const event of entry.events) await collectEventIfUnreferenced(db, event.id);
  if (entry.note) await collectNoteIfUnreferenced(db, entry.note.id);

  await touchTimeline(db, timelineId);
}

/** どの entry からも指されず、派生の親にも子にもなっていない event を消す。 */
async function collectEventIfUnreferenced(db: D1Database, eventId: number) {
  await db
    .prepare(
      `DELETE FROM events
        WHERE id = ?1
          AND NOT EXISTS (SELECT 1 FROM timeline_entry_events WHERE event_id = ?1)
          AND NOT EXISTS (SELECT 1 FROM derivations
                           WHERE kind = 'event' AND (ancestor_id = ?1 OR descendant_id = ?1))`,
    )
    .bind(eventId)
    .run();
}

/** 同じことを note について行う。 */
async function collectNoteIfUnreferenced(db: D1Database, noteId: number) {
  await db
    .prepare(
      `DELETE FROM notes
        WHERE id = ?1
          AND NOT EXISTS (SELECT 1 FROM timeline_entries WHERE note_id = ?1)
          AND NOT EXISTS (SELECT 1 FROM derivations
                           WHERE kind = 'note' AND (ancestor_id = ?1 OR descendant_id = ?1))`,
    )
    .bind(noteId)
    .run();
}

/** そのタイムラインで実際に使われているカテゴリ。入力フォームの候補に使う。 */
export async function listUsedCategories(db: D1Database, timelineId: number) {
  const { results } = await db
    .prepare(
      `SELECT ev.category, ev.subcategory, COUNT(*) AS count
         FROM timeline_entry_events tee
         JOIN timeline_entries te ON te.id = tee.entry_id
         JOIN events ev ON ev.id = tee.event_id
        WHERE te.timeline_id = ?
     GROUP BY ev.category, ev.subcategory
     ORDER BY count DESC`,
    )
    .bind(timelineId)
    .all<{ category: string | null; subcategory: string | null; count: number }>();
  return results;
}
