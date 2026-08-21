-- イベントとノートを分ける（docs/003-events-and-notes.md）。
--
-- これまで 1 つの events 行が「いつ・何が起きたか」と「それをどう読むか」を
-- まとめて持っていた。後者は属人的で、同じ出来事に複数あってよいものなので、
-- notes として切り出す。
--
--   events                 客観の核。名寄せの対象になる素材。単体では表示しない
--   notes                  属人のノート。1 つの出来事に何本でも
--   timeline_entries       年表の 1 行。採用したノートを固定して指す
--   timeline_entry_events  その行が指すイベント（1..N）。単独は要素数 1
--   derivations            派生の来歴。Copy on Write の記録
--
-- 既存の 720 件は 1 行 = 1 event + 1 note + 1 entry へ素直に移す。
-- 束ね（compound）や tagline の切り出しはデータ変換側の仕事（Issue #5〜#8）。

-- 移行中に events を作り直すので、外部キーの検査をトランザクション末尾まで遅らせる。
PRAGMA defer_foreign_keys = ON;

/* ── notes ────────────────────────────────────────────────────────────── */

-- tagline はキャッチコピー、body はこれまでの description。
-- links が events と notes の両方にあるのは意図的で、
-- 「その出来事の出典」と「そのノートの根拠」は別物だから（003 の 2 章）。
CREATE TABLE notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  tagline     TEXT,
  body        TEXT,
  links       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX notes_author_id_idx ON notes (author_id);

-- 既存の description を、そのタイムラインのオーナーのノートとして移す。
-- id を events.id に合わせておくと、このあとの対応づけが素直になる。
INSERT INTO notes (id, author_id, tagline, body, links, created_at, updated_at)
     SELECT e.id, t.owner_id, NULL, e.description, NULL, e.created_at, e.updated_at
       FROM events e
       JOIN timelines t ON t.id = e.timeline_id;

/* ── timeline_entries ─────────────────────────────────────────────────── */

-- 年表の 1 行。timeline_id を持つので、entry はつねにその年表のもので、
-- 他人の年表からコピーされることはない。共有されるのは event と note への参照だけ。
--
-- note_id が固定で刺さるのが要点。あとから人気順や推薦を入れても、
-- 既存の年表の文言が勝手に変わらない（003 の 9 章）。
CREATE TABLE timeline_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  timeline_id  INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  -- 参照されている note は削除できない（003 の 6 章）。D1 では下の RESTRICT に
  -- 加えて、アプリ側でも到達可能性を見てから消す。
  note_id      INTEGER REFERENCES notes(id) ON DELETE RESTRICT,
  -- 並びは指すイベントの日付で決まる。position は同じ日付内の同着をほぐすためだけのもの。
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX timeline_entries_timeline_id_idx ON timeline_entries (timeline_id, position, id);
CREATE INDEX timeline_entries_note_id_idx     ON timeline_entries (note_id);

INSERT INTO timeline_entries (id, timeline_id, note_id, position, created_at, updated_at)
     SELECT e.id, e.timeline_id, e.id, 0, e.created_at, e.updated_at
       FROM events e;

/* ── events の作り直し ────────────────────────────────────────────────── */

-- timeline_id と description を外す。所属は timeline_entries 経由になり、
-- 説明は notes.body へ移った。category / subcategory は「その出来事が何か」の
-- 分類なので events に残す（暫定の入れ物である点は変わらない）。
--
-- SQLite なので列を落とすのではなく作り直して入れ替える。
CREATE TABLE events_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,

  year         INTEGER NOT NULL,
  month        INTEGER,
  day          INTEGER,
  hour         INTEGER,
  minute       INTEGER,
  precision    TEXT    NOT NULL DEFAULT 'year'
               CHECK (precision IN ('century', 'decade', 'year', 'month', 'day', 'minute')),

  title        TEXT    NOT NULL,
  category     TEXT,
  subcategory  TEXT,
  links        TEXT,

  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO events_new
       (id, year, month, day, hour, minute, precision, title, category, subcategory, links,
        created_by, created_at, updated_at)
     SELECT id, year, month, day, hour, minute, precision, title, category, subcategory, links,
            created_by, created_at, updated_at
       FROM events;

DROP INDEX events_timeline_order_idx;
DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

-- 並び順は year → month → day → hour → minute → id の昇順のまま。
-- 下位の値が NULL の行は SQLite の既定で先頭に来るので、
-- 「下位の値が空のものはその区切りの先頭」という要件とそのまま一致する。
CREATE INDEX events_order_idx ON events (year, month, day, hour, minute, id);

/* ── timeline_entry_events ────────────────────────────────────────────── */

-- entry が指すイベント。単独のイベントは「要素数 1 の束ね」として扱う。
-- kind を持たせて経路を分けないのは、読む側のコードを 1 本に保つため（003 の 4 章）。
--
-- position 0 の行がその entry の代表で、並び順の基準に使う。
CREATE TABLE timeline_entry_events (
  entry_id  INTEGER NOT NULL REFERENCES timeline_entries(id) ON DELETE CASCADE,
  -- 参照されている event は削除できない（003 の 6 章）。
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, position)
);

CREATE INDEX timeline_entry_events_event_id_idx ON timeline_entry_events (event_id);

INSERT INTO timeline_entry_events (entry_id, event_id, position)
     SELECT id, id, 0 FROM timeline_entries;

/* ── derivations ──────────────────────────────────────────────────────── */

-- 派生の来歴。列ではなく行として持つのは、いつ・誰が・なぜ複製したかを
-- 記録でき、親を複数持て、必要なら推移閉包を張れるから（003 の 7 章）。
--
-- ancestor_id / descendant_id は kind に応じて events か notes を指す。
-- SQLite で行き先の違う外部キーは張れないので、整合はアプリ側で担保する。
CREATE TABLE derivations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  kind           TEXT    NOT NULL CHECK (kind IN ('event', 'note')),
  ancestor_id    INTEGER NOT NULL,
  descendant_id  INTEGER NOT NULL,
  reason         TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (kind, ancestor_id, descendant_id)
);

CREATE INDEX derivations_ancestor_idx   ON derivations (kind, ancestor_id);
CREATE INDEX derivations_descendant_idx ON derivations (kind, descendant_id);

-- 移行時点ではコピーが 1 件も起きていないので、この表は空で始まる。
