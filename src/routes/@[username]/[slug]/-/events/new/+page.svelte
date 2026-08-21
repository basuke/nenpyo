<script lang="ts">
  import EntryFields from "$lib/EntryFields.svelte";

  let { data, form } = $props();

  const base = $derived(`/@${data.username}/${data.timeline.slug}`);
</script>

<svelte:head><title>イベントを追加 — nenpyo.net</title></svelte:head>

<p class="breadcrumb">
  <a href="/@{data.username}">@{data.username}</a> /
  <a href={base}>{data.timeline.title}</a> /
</p>
<h1 class="page__title">イベントを追加</h1>

{#if form?.message}
  <p class="error">{form.message}</p>
{/if}

<form class="form" method="POST">
  <EntryFields values={form?.values} used={data.used} />

  <div class="actions">
    <button type="submit">追加する</button>
    <a href={base}>やめる</a>
  </div>
</form>
