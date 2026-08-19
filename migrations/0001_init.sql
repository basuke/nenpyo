-- 関心年表 MVP — 初期スキーマ
-- docs/001-mvp.md 第 3 版 7 章に対応。
--
-- 日時は ISO 8601 (UTC) の TEXT で保持する。SQLite に日時型はなく、
-- この形式なら JS の Date がそのまま解釈できて、文字列比較も時系列順になる。

-- ユーザー。github_id が不変キーで、username は変わりうる。
-- 本人がログインする前に行を先行作成できる（8.4 参照）。
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id     INTEGER NOT NULL UNIQUE,
  username      TEXT    NOT NULL COLLATE NOCASE UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- セッション。Cookie に入るのは id のみ。
CREATE TABLE sessions (
  id          TEXT    PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX sessions_user_id_idx    ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- サインアップの allowlist。ここに載っている GitHub ID だけがログインを通る。
CREATE TABLE allowed_github_ids (
  github_id   INTEGER PRIMARY KEY,
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- タイムライン。updated_at は配下のイベントの変更でも更新する。
CREATE TABLE timelines (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug         TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  description  TEXT,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (owner_id, slug)
);

CREATE INDEX timelines_updated_at_idx ON timelines (updated_at DESC);
CREATE INDEX timelines_owner_id_idx   ON timelines (owner_id, updated_at DESC);

-- イベント。timeline_id は暫定的に一対多（将来の多対多化を見越す）。
CREATE TABLE events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  timeline_id  INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,

  year         INTEGER NOT NULL,
  month        INTEGER,
  day          INTEGER,
  hour         INTEGER,
  minute       INTEGER,
  -- 時間の粒度。MVP では実質 'year' 固定だが、最初から持たせる。
  precision    TEXT    NOT NULL DEFAULT 'year'
               CHECK (precision IN ('century', 'decade', 'year', 'month', 'day', 'minute')),

  title        TEXT    NOT NULL,
  description  TEXT,

  -- 暫定。将来タイムラインやタグに昇格させる可能性がある。
  category     TEXT,
  subcategory  TEXT,

  -- 出典・参考リンクの JSON 配列。記法は docs/001-mvp.md 7 章を参照。
  links        TEXT,

  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 並び順（year → month → day → hour → minute → id）をそのままなぞる索引。
-- 下位の値が NULL のものは SQLite の既定で先頭に来るので、
-- 「下位の値が空のものはその区切りの先頭」という要件と一致する。
CREATE INDEX events_timeline_order_idx
  ON events (timeline_id, year, month, day, hour, minute, id);
