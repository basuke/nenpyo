-- 初期ユーザーと allowlist。
--
-- matsuo-koya は本人がまだログインしていないが、GitHub の数値 ID・login・
-- アバターは公開情報なので行を先行作成しておく。本人が初めてログインした
-- とき、github_id の一致でこの行に紐づく（docs/001-mvp.md 8.4）。

INSERT OR IGNORE INTO allowed_github_ids (github_id, note) VALUES
  (42601,     'basuke / Basuke Suzuki'),
  (235002527, 'matsuo-koya / Koya Matsuo');

INSERT OR IGNORE INTO users (github_id, username, display_name, avatar_url) VALUES
  (42601,     'basuke',      'Basuke Suzuki', 'https://avatars.githubusercontent.com/u/42601?v=4'),
  (235002527, 'matsuo-koya', 'Koya Matsuo',   'https://avatars.githubusercontent.com/u/235002527?v=4');
