<script lang="ts">
  import EntryFields from "$lib/EntryFields.svelte";

  let { data, form } = $props();

  const base = $derived(`/@${data.username}/${data.timeline.slug}`);
</script>

<svelte:head>
  <title>{data.into ? "束ねにイベントを足す" : "イベントを追加"} — nenpyo.net</title>
</svelte:head>

<p class="breadcrumb">
  <a href="/@{data.username}">@{data.username}</a> /
  <a href={base}>{data.timeline.title}</a> /
</p>
<h1 class="page__title">{data.into ? "束ねにイベントを足す" : "イベントを追加"}</h1>

{#if form?.message}
  <p class="error">{form.message}</p>
{/if}

{#if data.into}
  <!-- 足す先が決まっているとき。ノートは行のものが既にあるので、ここでは書かせない。 -->
  <p class="notice">
    「{data.into.titles.join(" / ")}」に足します。
    <br />
    キャッチコピーと説明は行に付いているものをそのまま使うので、ここでは事実だけ書いてください。
  </p>
{/if}

<form class="form" method="POST">
  {#if data.into}
    <input type="hidden" name="into" value={data.into.id} />
  {/if}

  <EntryFields
    values={form?.values ?? (data.into ? { year: data.into.year } : undefined)}
    used={data.used}
    factsOnly={Boolean(data.into)}
  />

  <div class="actions">
    <button type="submit">{data.into ? "束ねに足す" : "追加する"}</button>
    <a href={data.into ? `${base}/-/events/${data.into.id}/edit` : base}>やめる</a>
  </div>
</form>
