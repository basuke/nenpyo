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
/** ノートの持ち主や、その先祖を書いた人。アイコンと名前を出すのに要る分だけ。 */
export type Person = {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type TimelineEntry = {
  id: number;
  position: number;
  note: NoteRow | null;
  /** ノートの持ち主。本文を開いたときだけ出す（#25）。 */
  author: Person | null;
  /** 先祖のノートを書いた人。新しい順、重複を除いて最大 3 人。 */
  ancestors: Person[];
  events: EventRow[];
};

// 並びは代表イベント（position 0）の日付で決まる。position は同着をほぐすためだけ。
const ENTRY_ORDER =
  "ORDER BY ev.year ASC, ev.month ASC, ev.day ASC, ev.hour ASC, ev.minute ASC, te.position ASC, te.id ASC";

type EntryHeadRow = { id: number; position: number } & {
  [K in keyof NoteRow as `note_${string & K}`]: NoteRow[K] | null;
} & {
  author_id: number | null;
  author_username: string | null;
  author_display_name: string | null;
  author_avatar_url: string | null;
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
              n.updated_at  AS note_updated_at,
              au.id           AS author_id,
              au.username     AS author_username,
              au.display_name AS author_display_name,
              au.avatar_url   AS author_avatar_url
         FROM timeline_entries te
         JOIN timeline_entry_events tee ON tee.entry_id = te.id AND tee.position = 0
         JOIN events ev ON ev.id = tee.event_id
    LEFT JOIN notes n ON n.id = te.note_id
    LEFT JOIN users au ON au.id = n.author_id
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

  const ancestors = await listNoteAncestors(db, timelineId);

  return heads.results.map((head) => ({
    id: head.id,
    position: head.position,
    note: toNote(head),
    author: toPerson(head),
    ancestors: (head.note_id !== null && ancestors.get(head.note_id)) || [],
    events: byEntry.get(head.id) ?? [],
  }));
}

/** LEFT JOIN で引いた author_* 列を Person に戻す。 */
function toPerson(head: EntryHeadRow): Person | null {
  if (head.author_id === null || head.author_username === null) return null;
  return {
    id: head.author_id,
    username: head.author_username,
    display_name: head.author_display_name,
    avatar_url: head.author_avatar_url,
  };
}

/**
 * その年表で使われているノートの、先祖を書いた人を集める。
 *
 * derivations を遡る。誰のノートから来たのかを、名前ではなくアイコンの並びで
 * 見せるため（#11）。同じ人が続くことはあるので重ねて数えず、近いほうから
 * 最大 3 人に切る。
 *
 * 深さを 5 で止めているのは、際限なく遡っても出す場所が無いから。
 */
const ANCESTOR_LIMIT = 3;

async function listNoteAncestors(db: D1Database, timelineId: number): Promise<Map<number, Person[]>> {
  const { results } = await db
    .prepare(
      `WITH RECURSIVE ancestry(note_id, ancestor_id, depth) AS (
              SELECT te.note_id, d.ancestor_id, 1
                FROM timeline_entries te
                JOIN derivations d ON d.kind = 'note' AND d.descendant_id = te.note_id
               WHERE te.timeline_id = ?
           UNION ALL
              SELECT a.note_id, d.ancestor_id, a.depth + 1
                FROM ancestry a
                JOIN derivations d ON d.kind = 'note' AND d.descendant_id = a.ancestor_id
               WHERE a.depth < 5
            )
          SELECT a.note_id, u.id, u.username, u.display_name, u.avatar_url
            FROM ancestry a
            JOIN notes n ON n.id = a.ancestor_id
            JOIN users u ON u.id = n.author_id
        ORDER BY a.note_id, a.depth`,
    )
    .bind(timelineId)
    .all<{ note_id: number } & Person>();

  const byNote = new Map<number, Person[]>();
  for (const { note_id, ...person } of results) {
    const list = byNote.get(note_id) ?? [];
    if (list.length < ANCESTOR_LIMIT && !list.some((p) => p.id === person.id)) list.push(person);
    byNote.set(note_id, list);
  }
  return byNote;
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
    .prepare(
      "INSERT INTO timeline_entry_events (entry_id, event_id, timeline_id, position) VALUES (?, ?, ?, 0)",
    )
    .bind(entry.id, event.id, timelineId)
    .run();

  await touchTimeline(db, timelineId);
  return entry.id;
}

/**
 * そのノートが凍結されているか。凍結されているものは、持ち主でも直接は直せない。
 *
 *   参照が 2 つ以上  … 束ねの切り離しや、他人の年表から載せたことで共有されている。片方を直すと
 *                      もう片方が動いてしまう
 *   derivations の親 … 中身が変わると「N' は N から派生した」という記録が嘘になる
 *
 * docs/003-events-and-notes.md 5 章。
 */
async function noteIsFrozen(db: D1Database, noteId: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM timeline_entries WHERE note_id = ?1)                  AS refs,
              (SELECT COUNT(*) FROM derivations WHERE kind = 'note' AND ancestor_id = ?1) AS children`,
    )
    .bind(noteId)
    .first<{ refs: number; children: number }>();
  return Boolean(row && (row.refs > 1 || row.children > 0));
}

/**
 * 凍結されたノートを、この行のためのノートとして複製する。来歴を 1 行残す。
 *
 * **複製したものの持ち主は、書き換えた人になる。** 他人のノートを自分の年表に
 * 載せて、そこへ手を入れたなら、出来上がった文はその人のものである。元の人の
 * 名前が残り続けると、書いていないものを書いたことにしてしまう。
 * どこから来たかは derivations が語る（#11）。
 */
async function forkNote(
  db: D1Database,
  entry: TimelineEntry,
  authorId: number,
  tagline: string | null,
  body: string | null,
) {
  const ancestor = entry.note!;
  const forked = await db
    .prepare("INSERT INTO notes (author_id, tagline, body, links) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(authorId, tagline, body, ancestor.links)
    .first<{ id: number }>();
  if (!forked) throw new Error("failed to fork note");

  await db
    .prepare(
      `INSERT OR IGNORE INTO derivations (kind, ancestor_id, descendant_id, reason, created_by)
            VALUES ('note', ?, ?, '編集による複製', ?)`,
    )
    .bind(ancestor.id, forked.id, authorId)
    .run();

  await db
    .prepare("UPDATE timeline_entries SET note_id = ?, updated_at = ? WHERE id = ?")
    .bind(forked.id, now(), entry.id)
    .run();
}

/**
 * 代表イベントと note を書き換える。
 *
 * **ノートは凍結されていれば複製する**（docs/003 の 5 章）。切り離したあとの
 * 2 行は同じノートを指しているので、これが無いと片方を直したときにもう片方が動く。
 *
 * **イベントは複製しない。** 同じ出来事は同じ行に寄っていてほしいので、正しく
 * なる更新は参照している全員に届いてよい。毎回複製すると、名寄せしたい対象を
 * 名寄せの逆方向へ散らかすことになる。
 */
export async function updateEntry(
  db: D1Database,
  timelineId: number,
  entry: TimelineEntry,
  input: EntryInput,
  authorId: number,
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
    if (await noteIsFrozen(db, entry.note.id)) {
      await forkNote(db, entry, authorId, input.tagline, input.body);
    } else {
      await db
        .prepare("UPDATE notes SET tagline = ?, body = ?, updated_at = ? WHERE id = ?")
        .bind(input.tagline, input.body, now(), entry.note.id)
        .run();
    }
  } else if (input.tagline || input.body) {
    // ノートが無かった行に、初めてノートが付いた。
    const note = await db
      .prepare("INSERT INTO notes (author_id, tagline, body) VALUES (?, ?, ?) RETURNING id")
      .bind(authorId, input.tagline, input.body)
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

/**
 * ノートの歴代。いまのものから、derivations を遡って古いほうへ並べる。
 *
 * 複製が起きるのは、凍結されたノートに手を入れたとき（5 章）と、束ねを統合した
 * とき（#18）。後者は親が 2 つになるので、同じ深さに複数並ぶことがある。
 */
export type NoteRevision = NoteRow & {
  depth: number;
  reason: string | null;
  author: Person | null;
};

export async function listNoteHistory(db: D1Database, noteId: number): Promise<NoteRevision[]> {
  const { results } = await db
    .prepare(
      `WITH RECURSIVE chain(id, depth, reason) AS (
              SELECT ?, 0, NULL
           UNION ALL
              SELECT d.ancestor_id, c.depth + 1, d.reason
                FROM chain c
                JOIN derivations d ON d.kind = 'note' AND d.descendant_id = c.id
               WHERE c.depth < 20
            )
          SELECT n.*, c.depth, c.reason,
                 u.id AS person_id, u.username, u.display_name, u.avatar_url
            FROM chain c
            JOIN notes n ON n.id = c.id
       LEFT JOIN users u ON u.id = n.author_id
        ORDER BY c.depth, n.id`,
    )
    .bind(noteId)
    .all<NoteRow & { depth: number; reason: string | null; person_id: number | null } & Omit<Person, "id">>();

  return results.map(({ depth, reason, person_id, username, display_name, avatar_url, ...note }) => ({
    ...note,
    depth,
    reason,
    author: person_id === null ? null : { id: person_id, username, display_name, avatar_url },
  }));
}

/* ── 他人の年表から載せる ─────────────────────────────────────────────── */

/**
 * その年表に既にある event を返す。
 *
 * 1 つの年表に同じ出来事は一度だけ（migrations/0005）。制約は DB が守るので、
 * ここで見るのは「既にこの年表にあります」と手前で返すため。
 */
export async function eventsAlreadyIn(
  db: D1Database,
  timelineId: number,
  eventIds: number[],
): Promise<number[]> {
  if (!eventIds.length) return [];
  const placeholders = eventIds.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT event_id FROM timeline_entry_events
        WHERE timeline_id = ? AND event_id IN (${placeholders})`,
    )
    .bind(timelineId, ...eventIds)
    .all<{ event_id: number }>();
  return results.map((row) => row.event_id);
}

/**
 * 載せるときのノートの決め方。
 *
 *   share … 元のノートをそのまま参照する。参照が 2 本になるので、手を入れた
 *           時点で複製される（docs/003-events-and-notes.md 5 章）
 *   own   … 自分で書く。元のノートから派生したわけではないので来歴は残さない
 *   none  … 付けない
 */
export type PlacedNote =
  | { kind: "share" }
  | { kind: "own"; tagline: string | null; body: string | null }
  | { kind: "none" };

/**
 * 他人の年表にある行を、自分の年表にも載せる。
 *
 * **events は複製しない。** 同じ出来事は同じ行に寄っていてほしい素材なので、
 * 両方の年表が同じ行を参照する（docs/003 の 5 章）。できるのは自分の年表の
 * 新しい entry だけで、それが既にある event を指す。
 *
 * 行ごとに載せる。束ねはそのまま来て、要らないものは切り離せる（#18）。
 * イベントとノートが必ずセットで来るので、掛かり方がずれない。
 */
export async function placeEntry(
  db: D1Database,
  timelineId: number,
  source: TimelineEntry,
  note: PlacedNote,
  userId: number,
): Promise<number> {
  const eventIds = source.events.map((event) => event.id);

  const already = await eventsAlreadyIn(db, timelineId, eventIds);
  if (already.length) throw new Error(`既にこの年表にある出来事がある: ${already.join(", ")}`);

  let noteId: number | null = null;
  if (note.kind === "share") {
    noteId = source.note?.id ?? null;
  } else if (note.kind === "own") {
    const created = await db
      .prepare("INSERT INTO notes (author_id, tagline, body) VALUES (?, ?, ?) RETURNING id")
      .bind(userId, note.tagline, note.body)
      .first<{ id: number }>();
    if (!created) throw new Error("failed to insert note");
    noteId = created.id;
  }

  const entry = await db
    .prepare("INSERT INTO timeline_entries (timeline_id, note_id) VALUES (?, ?) RETURNING id")
    .bind(timelineId, noteId)
    .first<{ id: number }>();
  if (!entry) throw new Error("failed to insert timeline entry");

  // 元の行の並びをそのまま持ってくる。束ねの順は書き手の判断なので崩さない。
  await resequence(db, timelineId, entry.id, eventIds);
  await touchTimeline(db, timelineId);
  return entry.id;
}

/* ── 束ねの組み替え ───────────────────────────────────────────────────── */

/**
 * 束ねが指すイベントの並びを、日付の昇順で振り直す。
 *
 * position 0 のイベントがその行の年表上の位置を決めるので、足したり外したり
 * したあとは必ず通す。(entry_id, position) が主キーなので、
 * その場で番号をずらすと衝突する。いったん全部消してから入れ直す。
 */
async function resequence(
  db: D1Database,
  timelineId: number,
  entryId: number,
  eventIds: number[],
) {
  await db.prepare("DELETE FROM timeline_entry_events WHERE entry_id = ?").bind(entryId).run();
  for (const [position, eventId] of eventIds.entries()) {
    await db
      .prepare(
        "INSERT INTO timeline_entry_events (entry_id, event_id, timeline_id, position) VALUES (?, ?, ?, ?)",
      )
      .bind(entryId, eventId, timelineId, position)
      .run();
  }
}

/** 日付の昇順。events の並び順と同じ規則で、同着は元の順を保つ。 */
function byDate(events: EventRow[]): EventRow[] {
  const key = (e: EventRow) => [e.year, e.month ?? -1, e.day ?? -1, e.hour ?? -1, e.minute ?? -1];
  return [...events].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
    return 0;
  });
}

/** 束ねにイベントを 1 件足す。 */
export async function addEventToEntry(
  db: D1Database,
  timelineId: number,
  entry: TimelineEntry,
  createdBy: number,
  input: EntryInput,
) {
  const event = await db
    .prepare(
      `INSERT INTO events (year, precision, title, category, subcategory, links, created_by)
            VALUES (?, 'year', ?, ?, ?, ?, ?)
         RETURNING *`,
    )
    .bind(input.year, input.title, input.category, input.subcategory, input.links, createdBy)
    .first<EventRow>();
  if (!event) throw new Error("failed to insert event");

  await resequence(db, timelineId, entry.id, byDate([...entry.events, event]).map((e) => e.id));
  await touchTimeline(db, timelineId);
}

/**
 * 束ねの中の並びを指定どおりに振り直す。
 *
 * ここだけは日付順に寄せない。同じ年の出来事をどの順に読ませるかは書き手の
 * 判断で、`1998年は再起動の年` のような束ねでは並び自体が文章になっている。
 */
export async function reorderEntryEvents(
  db: D1Database,
  timelineId: number,
  entry: TimelineEntry,
  eventIds: number[],
) {
  const known = new Set(entry.events.map((event) => event.id));
  if (eventIds.length !== known.size || !eventIds.every((id) => known.has(id))) {
    throw new Error(`entry ${entry.id} の並べ替えに、元と違うイベントが混ざっている`);
  }
  await resequence(db, timelineId, entry.id, eventIds);
  await touchTimeline(db, timelineId);
}

/**
 * 束ねからイベントを切り離して、独立した行にする。
 *
 * **ノートは複製せず、そのまま共有する**（docs/003-events-and-notes.md 5 章）。
 * 切り離しは人がやる編集行為で、その人が画面の前にいる。付いていくべきかを
 * 機械が推測する必要はなく、おかしければその場で直せばよい。
 *
 * 共有したままだと片方を直したときにもう片方が動くので、そこは書き込み側で
 * 複製することで防ぐ。
 */
export async function detachEvent(
  db: D1Database,
  timelineId: number,
  entry: TimelineEntry,
  eventId: number,
): Promise<number> {
  const remaining = entry.events.filter((event) => event.id !== eventId);
  if (remaining.length === entry.events.length) throw new Error(`event ${eventId} is not in the entry`);
  if (!remaining.length) throw new Error("切り離すと元の行が空になる");

  const created = await db
    .prepare(
      `INSERT INTO timeline_entries (timeline_id, note_id, position)
            VALUES (?, ?, ?)
         RETURNING id`,
    )
    .bind(timelineId, entry.note?.id ?? null, entry.position)
    .first<{ id: number }>();
  if (!created) throw new Error("failed to insert timeline entry");

  await resequence(db, timelineId, created.id, [eventId]);
  await resequence(db, timelineId, entry.id, byDate(remaining).map((event) => event.id));
  await touchTimeline(db, timelineId);
  return created.id;
}

/**
 * 2 つの行を 1 つに束ねる。
 *
 * note_id は 1 本しか刺さらないので、**どちらを採るかを必ず決める**必要がある。
 * 新しく作った場合は元の 2 本が derivations の親になり、親は凍結されるので
 * どちらも残る。片方をそのまま採った場合、採らなかったほうは参照が切れて
 * 回収される（6 章）。
 */
export type MergeNote =
  | { kind: "existing"; noteId: number | null }
  | { kind: "new"; tagline: string | null; body: string | null };

export async function mergeEntries(
  db: D1Database,
  timelineId: number,
  target: TimelineEntry,
  source: TimelineEntry,
  choice: MergeNote,
  createdBy: number,
) {
  if (target.id === source.id) throw new Error("同じ行同士は束ねられない");

  let noteId: number | null;
  if (choice.kind === "existing") {
    noteId = choice.noteId;
  } else {
    const note = await db
      .prepare("INSERT INTO notes (author_id, tagline, body) VALUES (?, ?, ?) RETURNING id")
      .bind(createdBy, choice.tagline, choice.body)
      .first<{ id: number }>();
    if (!note) throw new Error("failed to insert note");
    noteId = note.id;

    // 統合したことを来歴に残す。親が 2 つになる初めての例で、
    // 切り離しのあとは両方の行が同じノートを指していることもあるので重複を潰す。
    const parents = [...new Set([target.note?.id, source.note?.id].filter((id) => id != null))];
    for (const ancestor of parents) {
      await db
        .prepare(
          `INSERT OR IGNORE INTO derivations (kind, ancestor_id, descendant_id, reason, created_by)
                VALUES ('note', ?, ?, '束ねによる統合', ?)`,
        )
        .bind(ancestor, noteId, createdBy)
        .run();
    }
  }

  const events = byDate([...target.events, ...source.events]).map((event) => event.id);

  await db.prepare("DELETE FROM timeline_entries WHERE id = ?").bind(source.id).run();
  await db
    .prepare("UPDATE timeline_entries SET note_id = ?, updated_at = ? WHERE id = ?")
    .bind(noteId, now(), target.id)
    .run();
  await resequence(db, timelineId, target.id, events);

  // 採らなかったノートは、他から参照されていなければ回収する。
  for (const id of [target.note?.id, source.note?.id]) {
    if (id != null && id !== noteId) await collectNoteIfUnreferenced(db, id);
  }
  await touchTimeline(db, timelineId);
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
