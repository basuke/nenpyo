<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>nenpyo.net</title></svelte:head>

<h1 class="page__title">関心年表</h1>
<p class="page__lead">つくりかけの叩き台です。</p>

{#if data.timelines.length === 0}
  <p class="muted">まだ年表がありません。</p>
{:else}
  <ul class="timeline-list">
    {#each data.timelines as timeline (timeline.id)}
      <li class="timeline-card">
        <h2 class="timeline-card__title">
          <a href="/@{timeline.owner_username}/{timeline.slug}">{timeline.title}</a>
        </h2>
        <p class="timeline-card__meta">
          <a href="/@{timeline.owner_username}">@{timeline.owner_username}</a>
          ・{timeline.event_count} 件
        </p>
        {#if timeline.description}
          <p class="timeline-card__desc">{timeline.description}</p>
        {/if}
      </li>
    {/each}
  </ul>
{/if}

{#if data.user}
  <p style="margin-top: 2rem"><a href="/@{data.user.username}/-/new">新しい年表をつくる</a></p>
{/if}
