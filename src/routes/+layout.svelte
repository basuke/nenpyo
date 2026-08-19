<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";

  let { data, children } = $props();
</script>

<header class="site-header">
  <div class="site-header__inner">
    <a class="site-header__brand" href="/">nenpyo.net</a>

    {#if data.user}
      <span class="site-header__user">
        {#if data.user.avatarUrl}
          <img class="avatar" src={data.user.avatarUrl} alt="" width="24" height="24" />
        {/if}
        <a href="/@{data.user.username}">@{data.user.username}</a>
      </span>
      <form method="POST" action="/logout">
        <button class="link small" type="submit">ログアウト</button>
      </form>
    {:else}
      <a class="small" href="/login?redirect={encodeURIComponent(page.url.pathname)}">ログイン</a>
    {/if}
  </div>
</header>

<main class="page">
  {@render children()}
</main>
