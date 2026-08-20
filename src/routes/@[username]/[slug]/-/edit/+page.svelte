<script lang="ts">
  let { data, form } = $props();

  const base = $derived(`/@${data.username}/${data.timeline.slug}`);
</script>

<svelte:head><title>{data.timeline.title} を編集 — nenpyo.net</title></svelte:head>

<p class="breadcrumb">
  <a href="/@{data.username}">@{data.username}</a> /
  <a href={base}>{data.timeline.title}</a> /
</p>
<h1 class="page__title">年表を編集</h1>

{#if form?.message}
  <p class="error">{form.message}</p>
{/if}

<form class="form" method="POST" action="?/save">
  <div class="field">
    <label for="title">タイトル</label>
    <input id="title" name="title" type="text" required
           value={form?.values?.title ?? data.timeline.title} />
  </div>

  <div class="field">
    <label for="slug">slug</label>
    <input id="slug" name="slug" type="text" required
           value={form?.values?.slug ?? data.timeline.slug} />
    <p class="field__hint">変えると URL も変わります。元の URL は残りません。</p>
  </div>

  <div class="field">
    <label for="description">説明（任意）</label>
    <textarea id="description" name="description">{form?.values?.description ?? data.timeline.description ?? ""}</textarea>
  </div>

  <div class="actions">
    <button type="submit">保存する</button>
    <a href={base}>やめる</a>
  </div>
</form>

<hr style="margin: 3rem 0 1.5rem; border: 0; border-top: 1px solid var(--border)" />

<form method="POST" action="?/delete"
      onsubmit={(event) => {
        if (!confirm(`「${data.timeline.title}」とイベント ${data.timeline.entryCount} 件を削除します。元に戻せません。`)) {
          event.preventDefault();
        }
      }}>
  <button class="danger" type="submit">この年表を削除する</button>
  <p class="field__hint" style="margin-top: 0.5rem">
    イベント {data.timeline.entryCount} 件も一緒に消えます。年表から外れるだけで、他の年表から参照されている出来事そのものは残ります。
  </p>
</form>
