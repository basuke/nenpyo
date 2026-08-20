<script lang="ts">
  import { categoryColor, categoryLabel, subcategoryLabel } from "$lib/categories";
  import { parseLinks } from "$lib/links";

  let { data } = $props();

  const base = $derived(`/@${data.owner.username}/${data.timeline.slug}`);

  // リンクは出来事の出典と読みの根拠の両方がありうるので、まとめて出す。
  // 区別して見せるのは Issue #9 で扱う。
  function linksOf(entry: (typeof data.years)[number]["entries"][number]) {
    return [...entry.events.flatMap((event) => parseLinks(event.links)), ...parseLinks(entry.note?.links ?? null)];
  }
</script>

<svelte:head><title>{data.timeline.title} — nenpyo.net</title></svelte:head>

<p class="breadcrumb"><a href="/@{data.owner.username}">@{data.owner.username}</a> /</p>

<h1 class="page__title">{data.timeline.title}</h1>
<p class="page__lead">{data.timeline.description ?? ""}</p>

<p class="small muted">
  {data.entryCount} 件
  {#if data.canEdit}
    ・<a href="{base}/-/events/new">イベントを追加</a>
    ・<a href="{base}/-/edit">年表を編集</a>
  {/if}
</p>

{#each data.years as group (group.year)}
  <section class="year">
    <h2 class="year__label">{group.year}</h2>

    <ul class="entries">
      {#each group.entries as entry (entry.id)}
        {@const links = linksOf(entry)}
        {@const head = entry.events[0]}
        <li class="entry">
          {#if head?.category || head?.subcategory}
            <p class="entry__tags">
              {#if head.category}
                <span class="tag" style="color: {categoryColor(head.category)}">
                  {categoryLabel(head.category)}
                </span>
              {/if}
              {#if head.subcategory}
                <span class="tag tag--sub">{subcategoryLabel(head.subcategory)}</span>
              {/if}
            </p>
          {/if}

          <!-- 束ねられた行は指すイベントを並べて 1 行として見せる。
               読み（tagline / body）は束ね全体に掛かっている。 -->
          <h3 class="entry__title">
            {#each entry.events as event, i (event.id)}{#if i > 0}<span class="entry__join">/</span
              >{/if}{event.title}{/each}
          </h3>

          {#if entry.note?.tagline}
            <p class="entry__tagline">{entry.note.tagline}</p>
          {/if}

          {#if entry.note?.body}
            <p class="entry__body">{entry.note.body}</p>
          {/if}

          {#if links.length}
            <ul class="entry__links">
              {#each links as link}
                <li><a href={link.href} rel="noreferrer noopener" target="_blank">{link.label}</a></li>
              {/each}
            </ul>
          {/if}

          {#if data.canEdit}
            <p class="entry__actions">
              <a href="{base}/-/events/{entry.id}/edit">編集</a>
            </p>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="muted">まだイベントがありません。</p>
{/each}
