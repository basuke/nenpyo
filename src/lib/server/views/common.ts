/**
 * 複数の画面が同じ形で使うもの。
 *
 * 「同じ形だから」ではなく、**同じことを指しているから**まとめる。
 * `TimelineLabel` はどの画面でも「見出しとパンくずに要る分の年表」だし、
 * `TimelineOrigin` はどこから来たかを示す。たまたま列が一致しただけの形は
 * ここに持ってこない。
 */

import type { Person, TimelineWithOwner } from "../db";


/** 年表の書き手。名前を出す分だけ。 */
export type OwnerView = { username: string; displayName: string | null };

/** 名前とアイコンを出す分だけの人。ノートの持ち主と、その先祖に使う。 */
export type PersonView = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function toPersonView(person: Person): PersonView {
  return {
    id: person.id,
    username: person.username,
    displayName: person.display_name,
    avatarUrl: person.avatar_url,
  };
}

/** 見出しとパンくずに要る分だけの年表。 */
export type TimelineLabel = { slug: string; title: string };

/** どの年表から来たか。載せる画面とノートの歴代で、戻り先を示すのに使う。 */
export type TimelineOrigin = { username: string } & TimelineLabel;

/**
 * 一覧に並ぶ年表 1 枚。トップでも `/@username` でも同じものを出す。
 *
 * `db.ts` の `TimelineWithOwner` をそのまま渡さないのは、あれが SQL の都合の
 * 形だから。`owner_username` のような列名が画面と、いずれ API のレスポンスに
 * そのまま出てしまう（CLAUDE.md 4 章）。
 */
export type TimelineCard = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  entryCount: number;
  updatedAt: string;
  owner: OwnerView;
};

export function toTimelineCard(row: TimelineWithOwner): TimelineCard {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    entryCount: row.entry_count,
    updatedAt: row.updated_at,
    owner: { username: row.owner_username, displayName: row.owner_display_name },
  };
}
