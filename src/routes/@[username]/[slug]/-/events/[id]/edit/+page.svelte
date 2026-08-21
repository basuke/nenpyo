<script lang="ts">
  import EntryFields from "$lib/EntryFields.svelte";

  let { data, form } = $props();

  const base = $derived(`/@${data.username}/${data.timeline.slug}`);
  const bundled = $derived(data.entry.events.length > 1);

  // 束ねられている行は 1 件ではないので、確認の文言にその数を出す。
  const removing = $derived(
    bundled ? `「${data.entry.title}」ほか ${data.entry.events.length - 1} 件` : `「${data.entry.title}」`,
  );

  let mergeWith = $state("");
</script>

<svelte:head><title>イベントを編集 — nenpyo.net</title></svelte:head>

<p class="breadcrumb">
  <a href="/@{data.username}">@{data.username}</a> /
  <a href={base}>{data.timeline.title}</a> /
</p>
<h1 class="page__title">イベントを編集</h1>

{#if form?.message}
  <p class="error">{form.message}</p>
{/if}

{#if form?.detached}
  <p class="notice">
    切り離しました。<strong>ノートは両方の行が共有したままです。</strong>
    片方だけ書き換えたいときは、その行を開いて直してください（直した時点で複製されます）。
  </p>
{/if}

<form class="form" method="POST" action="?/save">
  <EntryFields values={form?.values ?? data.entry} used={data.used} />

  <div class="actions">
    <button type="submit">保存する</button>
    <a href={base}>やめる</a>
  </div>
</form>

<!--
  束ねの中身。編集できるのは代表イベント（先頭）だけなので、残りは一覧として
  見せて、並べ替えと切り離しだけできるようにする。先頭がその行の年表上の
  位置を決めるので、順番は表示の都合ではない。
-->
<section class="bundle">
  <h2 class="bundle__title">この行が指しているイベント</h2>

  {#if bundled}
    <p class="field__hint">
      先頭のイベントが年表上の位置と、上のフォームで編集する対象を決めます。
    </p>
  {/if}

  <ol class="bundle__list">
    {#each data.entry.events as event, i (event.id)}
      <li class="bundle__item">
        <div class="bundle__row">
        <span class="bundle__name">{event.title}</span>
        {#if bundled}
          <span class="bundle__ops">
            <form method="POST" action="?/reorder">
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="direction" value="up" />
              <button class="linkish" type="submit" disabled={i === 0} title="上へ">↑</button>
            </form>
            <form method="POST" action="?/reorder">
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="direction" value="down" />
              <button class="linkish" type="submit"
                      disabled={i === data.entry.events.length - 1} title="下へ">↓</button>
            </form>
            <form method="POST" action="?/detach"
                  onsubmit={(e) => {
                    if (!confirm(`「${event.title}」を切り離して独立した行にします。ノートは両方で共有されます。`))
                      e.preventDefault();
                  }}>
              <input type="hidden" name="eventId" value={event.id} />
              <button class="linkish" type="submit">切り離す</button>
            </form>
          </span>
        {/if}
        </div>
      </li>
    {/each}
  </ol>

  <p class="bundle__add">
    <a href="{base}/-/events/new?into={data.entry.id}">この行にイベントを足す</a>
  </p>
</section>

<!-- 束ねる相手は同じ年表の同じ年に限る。entry は年表のものなので跨げない。 -->
{#if data.siblings.length}
  <section class="bundle">
    <h2 class="bundle__title">別の行と束ねる</h2>
    <form method="GET" action="{base}/-/events/{data.entry.id}/merge">
      <select name="with" bind:value={mergeWith} aria-label="束ねる相手">
        <option value="">選んでください</option>
        {#each data.siblings as sibling}
          <option value={sibling.id}>{sibling.label}</option>
        {/each}
      </select>
      <button type="submit" disabled={!mergeWith}>次へ</button>
      <p class="field__hint">
        ノートは 1 行に 1 本しか付けられないので、次の画面でどちらを採るか決めます。
      </p>
    </form>
  </section>
{/if}

<hr style="margin: 3rem 0 1.5rem; border: 0; border-top: 1px solid var(--border)" />

<!--
  消えるのは年表の行（entry）で、出来事そのものは他の年表から参照されていれば残る
  （docs/003-events-and-notes.md 6 章）。束ねられている場合は 1 件ではないので、
  何が外れるのかを文言に出す。
-->
<form method="POST" action="?/delete"
      onsubmit={(event) => {
        if (!confirm(`${removing}をこの年表から外します。元に戻せません。`)) event.preventDefault();
      }}>
  <button class="danger" type="submit">この行を年表から外す</button>
  <p class="field__hint">
    年表からは消えますが、他の年表から参照されている出来事とノートは残ります。
  </p>
</form>
