<script lang="ts">
  /**
   * イベントの入力欄。追加と編集で同じものを使う。
   *
   * MVP では年単位に限定するので、月日以下の欄は出さない
   * （スキーマ上は precision と月日を持っている）。
   */
  type Values = {
    year?: number | string;
    title?: string;
    description?: string | null;
    category?: string | null;
    subcategory?: string | null;
    links?: string | null;
  };

  let { values, used }: {
    values?: Values;
    used: { category: string | null; subcategory: string | null; count: number }[];
  } = $props();

  // 既にそのタイムラインで使われている値を候補に出す。
  // category / subcategory は暫定の入れ物なので、選択肢を固定しない。
  const categories = $derived([...new Set(used.map((u) => u.category).filter(Boolean))] as string[]);
  const subcategories = $derived([...new Set(used.map((u) => u.subcategory).filter(Boolean))] as string[]);
</script>

<div class="field">
  <label for="year">年</label>
  <input id="year" name="year" type="number" required step="1" min="-9999" max="9999"
         value={values?.year ?? ""} />
  <p class="field__hint">MVP では年単位のみ。月日は扱いません。</p>
</div>

<div class="field">
  <label for="title">タイトル</label>
  <input id="title" name="title" type="text" required value={values?.title ?? ""} />
</div>

<div class="field">
  <label for="description">説明（任意）</label>
  <textarea id="description" name="description">{values?.description ?? ""}</textarea>
</div>

<div class="field">
  <label for="category">カテゴリ（任意）</label>
  <input id="category" name="category" type="text" list="category-options"
         value={values?.category ?? ""} />
  <datalist id="category-options">
    {#each categories as option}<option value={option}></option>{/each}
  </datalist>
</div>

<div class="field">
  <label for="subcategory">分野（任意）</label>
  <input id="subcategory" name="subcategory" type="text" list="subcategory-options"
         value={values?.subcategory ?? ""} />
  <datalist id="subcategory-options">
    {#each subcategories as option}<option value={option}></option>{/each}
  </datalist>
</div>

<div class="field">
  <label for="links">リンク（任意）</label>
  <textarea id="links" name="links" style="min-height: 6rem">{values?.links ?? ""}</textarea>
  <p class="field__hint">
    1 行に 1 本。<br />
    <code>階差機関</code> → 日本語版 Wikipedia<br />
    <code>en:Analytical Engine</code> → 英語版 Wikipedia<br />
    <code>記事名|表示名</code> / <code>https://…|表示名</code> → 表示名を指定
  </p>
</div>
