<script lang="ts">
  /**
   * MCP クライアントへの同意画面（docs/007-mcp.md）。
   *
   * 普通のページとして書ける。OAuthProvider は authorizeEndpoint を自分では
   * 処理せず、そのまま SvelteKit へ渡してくるため。ログインは既存のものが
   * そのまま効く。
   *
   * **JavaScript を要らない形で書く。** 何を許すかを決める画面なので、
   * スクリプトが動かない環境でも壊れないほうがよい。既定では求められたもの
   * 全部にチェックが入っているが、外せる。決めるのは持ち主で、クライアントではない。
   */
  let { data, form } = $props();
</script>

<svelte:head><title>接続を許可する — nenpyo.net</title></svelte:head>

<h1 class="page__title">接続を許可しますか</h1>

<p class="page__lead">
  <strong>{data.client.name}</strong> が、あなたの年表に繋ごうとしています。
</p>

{#if data.client.uri}
  <p class="small muted"><a href={data.client.uri} rel="noreferrer noopener" target="_blank">{data.client.uri}</a></p>
{/if}

{#if form?.message}
  <p class="error">{form.message}</p>
{/if}

<form class="form" method="POST">
  <fieldset class="grants">
    <legend>許可するもの</legend>

    {#each data.choices as choice (choice.scope)}
      <label class="grant">
        <input type="checkbox" name="scope" value={choice.scope} checked />
        <span class="grant__label">{choice.label}</span>
        <span class="grant__detail">{choice.detail}</span>
      </label>
    {/each}
  </fieldset>

  <!--
    書いたものが誰のものになるかは、繋ぐ前に言っておく。
    AI が用意した文も、あなたの年表に載れば**あなたの持ち物**になる（#35）。
  -->
  <p class="field__hint">
    許可すると、{data.client.name} は
    <strong>@{data.user.username}</strong> として書き込みます。
    AI が用意した文も、あなたの年表に載ればあなたの持ち物になります。
  </p>

  <div class="actions">
    <button type="submit">許可する</button>
    <a href="/@{data.user.username}">やめる</a>
  </div>
</form>

<style>
  .grants {
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 1rem 1.25rem;
    margin: 1.5rem 0;
  }

  .grants legend {
    font-size: 0.85rem;
    color: var(--muted);
    padding: 0 0.4rem;
  }

  .grant {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 0.6rem;
    padding: 0.5rem 0;
    cursor: pointer;
  }

  .grant__label {
    font-weight: 600;
  }

  .grant__detail {
    grid-column: 2;
    font-size: 0.85rem;
    color: var(--muted);
  }
</style>
