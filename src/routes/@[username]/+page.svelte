<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>@{data.owner.username} — nenpyo.net</title></svelte:head>

<h1 class="page__title">
  {#if data.owner.avatarUrl}
    <img class="avatar" src={data.owner.avatarUrl} alt="" width="24" height="24"
         style="display: inline-block; vertical-align: -4px; margin-right: 0.375rem" />
  {/if}
  {data.owner.displayName ?? data.owner.username}
</h1>
<p class="page__lead">@{data.owner.username}</p>

{#if data.timelines.length === 0}
  <p class="muted">まだ年表がありません。</p>
{:else}
  <ul class="timeline-list">
    {#each data.timelines as timeline (timeline.id)}
      <li class="timeline-card">
        <h2 class="timeline-card__title">
          <a href="/@{data.owner.username}/{timeline.slug}">{timeline.title}</a>
        </h2>
        <p class="timeline-card__meta">{timeline.entryCount} 件</p>
        {#if timeline.description}
          <p class="timeline-card__desc">{timeline.description}</p>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

{#if data.canEdit}
  <p style="margin-top: 2rem"><a href="/@{data.owner.username}/-/new">新しい年表をつくる</a></p>
{/if}
