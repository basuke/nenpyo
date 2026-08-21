<script lang="ts">
  let { data } = $props();

  const from = $derived(`/@${data.from.username}/${data.from.slug}`);
</script>

<svelte:head><title>ノートの歴代 — nenpyo.net</title></svelte:head>

<p class="breadcrumb">
  <a href="/@{data.from.username}">@{data.from.username}</a> /
  <a href={from}>{data.from.title}</a> /
</p>
<h1 class="page__title">ノートの歴代</h1>

<p class="page__lead">
  いまのものから、派生をさかのぼって古いほうへ並べています。
</p>

<ol class="history">
  {#each data.history as revision (revision.id)}
    <li class="history__item">
      <p class="history__meta">
        {#if revision.author}
          {#if revision.author.avatarUrl}
            <img class="avatar" src={revision.author.avatarUrl} alt="" width="18" height="18" />
          {/if}
          <a href="/@{revision.author.username}">{revision.author.displayName ?? revision.author.username}</a>
        {:else}
          <span class="muted">書き手不明</span>
        {/if}
        {#if revision.depth === 0}
          <span class="tag tag--sub">いま使われているもの</span>
        {:else if revision.reason}
          <span class="muted">{revision.reason}</span>
        {/if}
      </p>
      {#if revision.tagline}<p class="entry__tagline">{revision.tagline}</p>{/if}
      {#if revision.body}<p class="entry__body">{revision.body}</p>{/if}
      {#if !revision.tagline && !revision.body}<p class="muted">（空）</p>{/if}
    </li>
  {/each}
</ol>

<p class="small"><a href={from}>{data.from.title} に戻る</a></p>
