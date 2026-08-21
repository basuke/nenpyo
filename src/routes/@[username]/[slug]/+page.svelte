<script lang="ts">
  import { categoryColor, categoryLabel, subcategoryLabel } from "$lib/categories";
  import { parseLinks } from "$lib/links";

  let { data } = $props();

  const base = $derived(`/@${data.owner.username}/${data.timeline.slug}`);

  type Entry = (typeof data.years)[number]["entries"][number];

  /**
   * リンクは出どころが 2 つある。出来事そのものの出典（events.links）と、
   * その読みの根拠（notes.links）は別物なので、まとめずに分けて出す
   * （docs/003-events-and-notes.md 2 章）。
   */
  function linksOf(entry: Entry) {
    return {
      sources: entry.events.flatMap((event) => parseLinks(event.links)),
      references: parseLinks(entry.note?.links ?? null),
    };
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
        {@const bundled = entry.events.length > 1}
        <li class="entry" class:entry--bundled={bundled}>
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

          <!--
            束ねられた行は、指しているイベントを 1 件ずつ縦に並べて、
            まとめて括られていることを左の罫線で示す。読み（tagline / body）は
            罫線の外に置く。束ね全体に掛かっているものだからで、
            「1937年は再起動の年」のような読みは個々の出来事の説明ではない。
          -->
          <h3 class="entry__title">
            {#each entry.events as event (event.id)}
              <span class="entry__event">{event.title}</span>
            {/each}
          </h3>

          {#if entry.note?.tagline}
            <p class="entry__tagline">{entry.note.tagline}</p>
          {/if}

          {#if entry.note?.body}
            <p class="entry__body">{entry.note.body}</p>
          {/if}

          {#if links.sources.length || links.references.length}
            <div class="entry__links">
              {#if links.sources.length}
                <ul class="linklist">
                  {#each links.sources as link}
                    <li><a href={link.href} rel="noreferrer noopener" target="_blank">{link.label}</a></li>
                  {/each}
                </ul>
              {/if}
              {#if links.references.length}
                <ul class="linklist linklist--reference">
                  <li class="linklist__label">読みの根拠</li>
                  {#each links.references as link}
                    <li><a href={link.href} rel="noreferrer noopener" target="_blank">{link.label}</a></li>
                  {/each}
                </ul>
              {/if}
            </div>
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
