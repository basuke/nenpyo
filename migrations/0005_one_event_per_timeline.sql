-- 1 つの年表の中で、同じ出来事が二度現れないようにする。
--
-- 他人の年表から自分の年表へ出来事を載せられるようにすると（Issue #11）、
-- 同じ event を指す entry が同じ年表に複数できてしまう経路が生まれる。
--
--   ・同じ行をもう一度載せる
--   ・束ねを持っている状態で、その中の 1 件を単体で載せる
--   ・単体を持っている状態で、それを含む束ねを載せる
--
-- どれも「同じ年表の中で同じ event を 2 つの entry が指す」という一つの形なので、
-- 制約 1 本で全部塞げる。
--
-- timeline_entry_events は entry を経由しないと年表が分からないので、
-- timeline_id を持たせて UNIQUE を張れるようにする。entry が年表を移ることは
-- ない（entry は年表のもの）ので、いったん入れた値は動かない。
--
-- アプリ側でも重複は見るが、それは「既にこの年表にあります」と親切に返すため。
-- 最後の砦はここに置く。0004 で外部キーに削除を守らせたのと同じ考え方。

PRAGMA defer_foreign_keys = ON;

CREATE TABLE timeline_entry_events_new (
  entry_id     INTEGER NOT NULL REFERENCES timeline_entries(id) ON DELETE CASCADE,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  -- entry_id から辿れる値の写し。UNIQUE を張るためだけに持つ。
  timeline_id  INTEGER NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, position),
  UNIQUE (timeline_id, event_id)
);

INSERT INTO timeline_entry_events_new (entry_id, event_id, timeline_id, position)
     SELECT tee.entry_id, tee.event_id, te.timeline_id, tee.position
       FROM timeline_entry_events tee
       JOIN timeline_entries te ON te.id = tee.entry_id;

DROP INDEX timeline_entry_events_event_id_idx;
DROP TABLE timeline_entry_events;
ALTER TABLE timeline_entry_events_new RENAME TO timeline_entry_events;

CREATE INDEX timeline_entry_events_event_id_idx ON timeline_entry_events (event_id);
