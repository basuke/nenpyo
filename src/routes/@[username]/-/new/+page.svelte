<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>新しい年表 — nenpyo.net</title></svelte:head>

<p class="breadcrumb"><a href="/@{data.username}">@{data.username}</a> /</p>
<h1 class="page__title">新しい年表</h1>

{#if form?.message}
  <p class="error">{form.message}</p>
{/if}

<form class="form" method="POST">
  <div class="field">
    <label for="title">タイトル</label>
    <input id="title" name="title" type="text" required value={form?.values?.title ?? ""} />
  </div>

  <div class="field">
    <label for="slug">slug</label>
    <input id="slug" name="slug" type="text" required
           placeholder="sf-tech-lifeline" value={form?.values?.slug ?? ""} />
    <p class="field__hint">
      URL になります: /@{data.username}/<em>slug</em><br />
      英小文字・数字・ハイフン。英数字で始めてください。
    </p>
  </div>

  <div class="field">
    <label for="description">説明（任意）</label>
    <textarea id="description" name="description">{form?.values?.description ?? ""}</textarea>
  </div>

  <div class="actions">
    <button type="submit">つくる</button>
    <a href="/@{data.username}">やめる</a>
  </div>
</form>
