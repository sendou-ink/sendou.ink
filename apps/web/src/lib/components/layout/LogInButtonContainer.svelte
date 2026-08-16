<script lang="ts">
import type { Snippet } from "svelte";
import { LOG_IN_URL } from "#lib/utils/urls.ts";

interface Props {
	children: Snippet;
}

let { children }: Props = $props();
</script>

<form action={LOG_IN_URL} method="post" class="stack items-center">
	{@render children()}
</form>
