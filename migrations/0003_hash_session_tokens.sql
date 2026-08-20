-- セッショントークンを平文で保存するのをやめ、SHA-256 のハッシュだけを持つ。
--
-- Cookie に入るのは 256 ビットの乱数そのもので、DB にはそのハッシュを置く。
-- こうしておくと、DB の中身が漏れても、そこから成りすませるトークンは作れない。
--
-- 既存の行は平文のままなので照合できない。消す＝全員が一度ログアウトになる。

DELETE FROM sessions;

ALTER TABLE sessions RENAME COLUMN id TO token_hash;
