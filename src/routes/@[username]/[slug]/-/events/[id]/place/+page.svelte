<script lang="ts">
  let { data, form } = $props();

  const from = $derived(`/@${data.from.username}/${data.from.slug}`);
  const available = $derived(data.targets.filter((target) => target.taken === 0));
</script>

<svelte:head><title>自分の年表に載せる — nenpyo.net</title></svelte:head>

<p class="breadcrumb">
  <a href="/@{data.from.username}">@{data.from.username}</a> /
  <a href={from}>{data.from.title}</a> /
</p>
<h1 class="page__title">自分の年表に載せる</h1>

{#if form?.message}
  <p class="error">{form.message}</p>
{/if}

<!--
  載せるとイベントは複製されず、両方の年表が同じ行を指す。ここで見せているのは
  その元の行（docs/003-events-and-notes.md 5 章）。
-->
<div class="notice">
  <p class="small muted">{data.source.year}</p>
  <p><strong>{data.source.titles.join(" / ")}</strong></p>
  {#if data.source.tagline}<p class="entry__tagline">{data.source.tagline}</p>{/if}
  {#if data.source.author}<p class="small muted">ノート: {data.source.author}</p>{/if}
</div>

{#if !data.targets.length}
  <p>載せられる年表がありません。先に<a href="/@{data.from.username}/-/new">年表を作って</a>ください。</p>
{:else if !available.length}
  <p>選べる年表がありません。持っている年表にはすべて、この出来事がもう載っています。</p>
  <p class="small muted">1 つの年表に同じ出来事は一度だけです。</p>
{:else}
  <form class="form" method="POST">
    <div class="field">
      <label for="timelineId">どの年表に載せるか</label>
      <select id="timelineId" name="timelineId">
        {#each data.targets as target}
          <option value={target.id} disabled={target.taken > 0}>
            {target.title}{target.taken > 0 ? "（もう載っています）" : ""}
          </option>
        {/each}
      </select>
    </div>

    <fieldset class="field">
      <legend>ノート</legend>

      <label class="choice__option">
        <input type="radio" name="note" value="share" checked disabled={!data.source.hasNote} />
        <span>元のノートをそのまま使う</span>
      </label>
      <p class="field__hint">
        参照するだけなので複製されません。手を入れた時点で自分のノートになります。
      </p>

      <label class="choice__option">
        <input type="radio" name="note" value="own" />
        <span>自分で書く</span>
      </label>
      <div class="choice__note">
        <div class="field">
          <label for="tagline">キャッチコピー（任意）</label>
          <input id="tagline" name="tagline" type="text" maxlength="100"
                 value={form?.values?.tagline ?? ""} />
        </div>
        <div class="field">
          <label for="body">説明（任意）</label>
          <textarea id="body" name="body">{form?.values?.body ?? ""}</textarea>
        </div>
      </div>

      <label class="choice__option">
        <input type="radio" name="note" value="none" checked={!data.source.hasNote} />
        <span>付けない</span>
      </label>
    </fieldset>

    <div class="actions">
      <button type="submit">載せる</button>
      <a href={from}>やめる</a>
    </div>
  </form>
{/if}
