<script lang="ts">
  import { categoryColor, categoryLabel, subcategoryLabel } from "$lib/categories";
  import { parseLinks } from "$lib/links";

  let { data } = $props();

  const base = $derived(`/@${data.owner.username}/${data.timeline.slug}`);
</script>

<svelte:head><title>{data.timeline.title} — nenpyo.net</title></svelte:head>

<p class="breadcrumb"><a href="/@{data.owner.username}">@{data.owner.username}</a> /</p>

<h1 class="page__title">{data.timeline.title}</h1>
<p class="page__lead">{data.timeline.description ?? ""}</p>

<p class="small muted">
  {data.eventCount} 件
  {#if data.canEdit}
    ・<a href="{base}/-/events/new">イベントを追加</a>
    ・<a href="{base}/-/edit">年表を編集</a>
  {/if}
</p>

{#each data.years as group (group.year)}
  <section class="year">
    <h2 class="year__label">{group.year}</h2>

    <ul class="events">
      {#each group.events as event (event.id)}
        {@const links = parseLinks(event.links)}
        <li class="event">
          {#if event.category || event.subcategory}
            <p class="event__tags">
              {#if event.category}
                <span class="tag" style="color: {categoryColor(event.category)}">
                  {categoryLabel(event.category)}
                </span>
              {/if}
              {#if event.subcategory}
                <span class="tag tag--sub">{subcategoryLabel(event.subcategory)}</span>
              {/if}
            </p>
          {/if}

          <h3 class="event__title">{event.title}</h3>

          {#if event.description}
            <p class="event__body">{event.description}</p>
          {/if}

          {#if links.length}
            <ul class="event__links">
              {#each links as link}
                <li><a href={link.href} rel="noreferrer noopener" target="_blank">{link.label}</a></li>
              {/each}
            </ul>
          {/if}

          {#if data.canEdit}
            <p class="event__actions">
              <a href="{base}/-/events/{event.id}/edit">編集</a>
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="muted">まだイベントがありません。</p>
{/each}
