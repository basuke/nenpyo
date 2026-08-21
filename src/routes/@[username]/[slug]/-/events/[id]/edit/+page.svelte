<script lang="ts">
  import EntryFields from "$lib/EntryFields.svelte";

  let { data, form } = $props();

  const base = $derived(`/@${data.username}/${data.timeline.slug}`);

  // 束ねられている行は 1 件ではないので、確認の文言にその数を出す。
  const removing = $derived(
    data.entry.bundled.length
      ? `「${data.entry.title}」ほか ${data.entry.bundled.length} 件`
      : `「${data.entry.title}」`,
  );
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

{#if data.entry.bundled.length}
  <!-- 束ねられた行。ここで直せるのは先頭のイベントと、束ね全体に掛かるノートだけ。 -->
  <p class="notice">
    この行は {data.entry.bundled.length + 1} 件のイベントを束ねています。
    ここで編集できるのは先頭の「{data.entry.title}」と、束ね全体に掛かるノートです。
    <br />
    束ねられている残り: {data.entry.bundled.join("、")}
  </p>
{/if}

<form class="form" method="POST" action="?/save">
  <EntryFields values={form?.values ?? data.entry} used={data.used} />

  <div class="actions">
    <button type="submit">保存する</button>
    <a href={base}>やめる</a>
  </div>
</form>

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
