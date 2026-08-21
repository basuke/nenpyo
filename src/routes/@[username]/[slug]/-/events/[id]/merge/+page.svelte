<script lang="ts">
  let { data, form } = $props();

  const base = $derived(`/@${data.username}/${data.timeline.slug}`);

  // 新しく書くときの初期値は、片方が空ならもう片方で埋める。
  // 送るのは DOM の値そのものなので、状態としては持たない。
  const tagline = $derived(form?.values?.tagline ?? data.target.tagline ?? data.source.tagline ?? "");
  const body = $derived(form?.values?.body ?? data.target.body ?? data.source.body ?? "");
</script>

<svelte:head><title>行を束ねる — nenpyo.net</title></svelte:head>

<p class="breadcrumb">
  <a href="/@{data.username}">@{data.username}</a> /
  <a href={base}>{data.timeline.title}</a> /
</p>
<h1 class="page__title">行を束ねる</h1>

<p class="page__lead">
  {data.target.titles.join(" / ")} と {data.source.titles.join(" / ")} を 1 行にまとめます。
</p>

{#if form?.message}
  <p class="error">{form.message}</p>
{/if}

<p class="notice">
  ノートは 1 行に 1 本しか付けられません。<strong>どちらを採るか、新しく書くかを選んでください。</strong>
  <br />
  新しく書いた場合、元の 2 本は来歴に残ります。片方をそのまま採った場合、
  <strong>採らなかったほうは他から参照されていなければ消えます。</strong>
</p>

<form class="form" method="POST">
  <input type="hidden" name="with" value={data.source.id} />

  <div class="choice">
    <label class="choice__option">
      <input type="radio" name="choice" value="target" />
      <span class="choice__label">{data.target.titles.join(" / ")} のノートを使う</span>
    </label>
    <div class="choice__note">
      {#if data.target.tagline}<p class="entry__tagline">{data.target.tagline}</p>{/if}
      {#if data.target.body}<p class="entry__body">{data.target.body}</p>{/if}
      {#if !data.target.tagline && !data.target.body}<p class="muted">（ノートなし）</p>{/if}
    </div>
  </div>

  <div class="choice">
    <label class="choice__option">
      <input type="radio" name="choice" value="source" />
      <span class="choice__label">{data.source.titles.join(" / ")} のノートを使う</span>
    </label>
    <div class="choice__note">
      {#if data.source.tagline}<p class="entry__tagline">{data.source.tagline}</p>{/if}
      {#if data.source.body}<p class="entry__body">{data.source.body}</p>{/if}
      {#if !data.source.tagline && !data.source.body}<p class="muted">（ノートなし）</p>{/if}
    </div>
  </div>

  <div class="choice">
    <label class="choice__option">
      <input type="radio" name="choice" value="new" checked />
      <span class="choice__label">新しく書く</span>
    </label>
    <div class="choice__note">
      <p class="field__hint">
        束ねたことで主張が変わるなら、こちら。元の 2 本は来歴に残ります。
      </p>
      <div class="field">
        <label for="tagline">キャッチコピー（任意）</label>
        <input id="tagline" name="tagline" type="text" maxlength="100" value={tagline} />
      </div>
      <div class="field">
        <label for="body">説明（任意）</label>
        <textarea id="body" name="body">{body}</textarea>
      </div>
    </div>
  </div>

  <div class="actions">
    <button type="submit">束ねる</button>
    <a href="{base}/-/events/{data.target.id}/edit">やめる</a>
  </div>
</form>
