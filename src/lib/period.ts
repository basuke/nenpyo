/**
 * イベントが指している期間。
 *
 * `precision` は「どこまで細かく分かっているか」で、イベントが指すのは点では
 * なく期間である。`1998` は 1998 年まるごとを、`1998-03` は 3 月まるごとを指す
 * （docs/001-mvp.md 7 章）。
 *
 * 束ねられるかどうかの判定に使う。同じ年かどうかではなく、**片方の期間が
 * もう片方を含んでいるか**が条件になる。
 */

export type Precision = "century" | "decade" | "year" | "month" | "day" | "minute";

export type Period = {
  year: number;
  month: number | null;
  day: number | null;
  hour: number | null;
  minute: number | null;
  precision: string;
};

/**
 * その精度で「どこまでが同じなら同じ期間か」を表す鍵。
 *
 * 世紀と十年紀は年を丸めた 1 要素、それより細かいものは年から順に並べる。
 * 負の年でも floor で丸めるので、-45 と -41 は同じ十年紀（-50 年代）になる。
 */
function key(period: Period): number[] {
  const { year, month, day, hour, minute } = period;
  switch (period.precision) {
    case "century":
      return [Math.floor(year / 100)];
    case "decade":
      return [Math.floor(year / 10)];
    case "year":
      return [year];
    case "month":
      return [year, month ?? 1];
    case "day":
      return [year, month ?? 1, day ?? 1];
    case "minute":
      return [year, month ?? 1, day ?? 1, hour ?? 0, minute ?? 0];
    default:
      // 知らない精度は年として扱う。落とすより粗いほうへ倒す。
      return [year];
  }
}

/** 粗いほど小さい。世紀と十年紀は年より粗いので、年の手前に置く。 */
const RANK: Record<string, number> = {
  century: 0,
  decade: 1,
  year: 2,
  month: 3,
  day: 4,
  minute: 5,
};

const rank = (period: Period) => RANK[period.precision] ?? RANK.year;

/**
 * outer が inner を含んでいるか。同じ期間どうしも含むとみなす。
 *
 * 世紀・十年紀は年の丸め方が違うので、年より細かい相手とは年に直して比べる。
 */
export function contains(outer: Period, inner: Period): boolean {
  if (rank(outer) > rank(inner)) return false;

  const [a, b] = [key(outer), key({ ...inner, precision: outer.precision })];
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * 束ねられるか。
 *
 * **全部を含む期間が 1 つあること**が条件。`1998` と `1998-03` と `1998-05` は
 * 1998 が全部を含むので束ねられるが、`1998-03` と `1998-05` だけでは
 * どちらも他方を含まないので束ねられない。
 *
 * 束ねた行は年表の 1 か所に出る。そこに収まらない期間の出来事が混ざると、
 * 行の位置が嘘になる。
 */
export function bundleable(periods: Period[]): boolean {
  if (periods.length < 2) return true;
  return periods.some((outer) => periods.every((inner) => contains(outer, inner)));
}
