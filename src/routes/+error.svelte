<script lang="ts">
  import { page } from "$app/state";
</script>

<h1 class="page__title">{page.status}</h1>
<p class="page__lead">{page.error?.message ?? "問題が起きました"}</p>
<p><a href="/">トップへ</a></p>
