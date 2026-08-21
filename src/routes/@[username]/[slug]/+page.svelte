<script lang="ts">
  import { categoryColor, categoryLabel, subcategoryLabel } from "$lib/categories";
  import { parseLinks } from "$lib/links";

  let { data } = $props();

  const base = $derived(`/@${data.owner.username}/${data.timeline.slug}`);

  type Entry = (typeof data.years)[number]["entries"][number];

  /**
   * リンクは出どころが 2 つある。出来事そのものの出典（events.links）と、
   * そのノートの根拠（notes.links）は別物なので、まとめずに分けて出す
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
        {@const more = Boolean(entry.note?.body) || links.sources.length > 0
          || links.references.length > 0 || Boolean(entry.author) || data.canEdit || data.canPlace}
        <li class="entry">
          <!--
            折りたたんだ行に出すのは、イベント名とキャッチコピーだけ。
            本文まで並べると 720 行が壁になって、年表として読めない。

            開閉は details / summary に任せる。このページは csr = false なので
            （720 件がハイドレーション用の JSON として二重に載るのを避けるため）、
            JavaScript を要らない仕組みで開く必要がある。
          -->
          {#if more}
            <details class="entry__details">
              <summary class="entry__summary">
                <h3 class="entry__title">
                  {#each entry.events as event, i (event.id)}
                    {#if i > 0}<span class="entry__join">/</span>{/if}{event.title}
                  {/each}
                </h3>
                {#if entry.note?.tagline}
                  <p class="entry__tagline">{entry.note.tagline}</p>
                {/if}
              </summary>

              <div class="entry__more">
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
                        <li class="linklist__label">ノートの根拠</li>
                        {#each links.references as link}
                          <li><a href={link.href} rel="noreferrer noopener" target="_blank">{link.label}</a></li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {/if}

                <!--
                  ノートの持ち主は開いたときだけ出す（#25）。折りたたみ側に出すと
                  自分の年表で自分の名前が何百回も並ぶ。
                  先祖は名前ではなくアイコンだけで、誰のノートから来たのかを示す。
                -->
                {#if entry.author}
                  <p class="entry__by">
                    {#if entry.ancestors.length}
                      <a class="entry__ancestors" href="{base}/-/notes/{entry.note?.id}"
                         title="このノートの歴代を見る">
                        {#each entry.ancestors as person (person.id)}
                          {#if person.avatar_url}
                            <img class="avatar avatar--stacked" src={person.avatar_url}
                                 alt={person.username} width="18" height="18" loading="lazy" />
                          {:else}
                            <span class="avatar avatar--stacked avatar--blank">{person.username.slice(0, 1)}</span>
                          {/if}
                        {/each}
                      </a>
                    {/if}
                    {#if entry.author.avatar_url}
                      <img class="avatar" src={entry.author.avatar_url} alt=""
                           width="18" height="18" loading="lazy" />
                    {/if}
                    <a href="/@{entry.author.username}">{entry.author.display_name ?? entry.author.username}</a>
                  </p>
                {/if}

                {#if data.canEdit || data.canPlace}
                  <p class="entry__actions">
                    {#if data.canEdit}
                      <a href="{base}/-/events/{entry.id}/edit">編集</a>
                    {/if}
                    {#if data.canPlace}
                      <a href="{base}/-/events/{entry.id}/place">自分の年表に載せる</a>
                    {/if}
                  </p>
                {/if}
              </div>
            </details>
          {:else}
            <!-- 開いても何も無い行。開閉の印を出すと空振りになる。 -->
            <div class="entry__summary entry__summary--flat">
              <h3 class="entry__title">
                {#each entry.events as event, i (event.id)}
                  {#if i > 0}<span class="entry__join">/</span>{/if}{event.title}
                {/each}
              </h3>
              {#if entry.note?.tagline}
                <p class="entry__tagline">{entry.note.tagline}</p>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{:else}
  <p class="muted">まだイベントがありません。</p>
{/each}
