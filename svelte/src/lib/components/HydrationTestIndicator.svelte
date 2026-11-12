<script lang="ts">
import { navigating, page } from "$app/state";
import { pendingMutations } from "#lib/pending-mutations.svelte.ts";

// rendered by an effect, so its presence means event handlers are attached
let isHydrated = $state(false);
$effect(() => {
	isHydrated = true;
});

const isIdle = $derived(navigating.to === null && pendingMutations.count === 0);
</script>

{#if isHydrated}
	<div
		style:display="none"
		data-testid="hydrated"
		data-router-idle={isIdle ? "true" : undefined}
		data-router-busy={isIdle ? undefined : "busy"}
		data-location-search={page.url.search}
		data-location-pathname={page.url.pathname}
	></div>
{/if}
