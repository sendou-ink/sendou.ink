<script lang="ts">
import { page } from "$app/state";
import Main from "#lib/components/Main.svelte";
</script>

<Main class="stack md items-center">
	<h1 class="text-xl">{page.status}</h1>
	<p>{page.error?.message}</p>
</Main>
