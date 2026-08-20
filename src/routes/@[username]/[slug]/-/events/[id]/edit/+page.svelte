<script lang="ts">
  import EntryFields from "$lib/EntryFields.svelte";

  let { data, form } = $props();

  const base = $derived(`/@${data.username}/${data.timeline.slug}`);
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

<form class="form" method="POST" action="?/save">
  <EntryFields values={form?.values ?? data.entry} used={data.used} />

  <div class="actions">
    <button type="submit">保存する</button>
    <a href={base}>やめる</a>
  </div>
</form>

<hr style="margin: 3rem 0 1.5rem; border: 0; border-top: 1px solid var(--border)" />

<form method="POST" action="?/delete"
      onsubmit={(event) => {
        if (!confirm(`「${data.entry.title}」を削除します。元に戻せません。`)) event.preventDefault();
      }}>
  <button class="danger" type="submit">このイベントを削除する</button>
</form>
