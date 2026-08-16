<script lang="ts" module>
	let pendingRemoteRequests = $state(0);
	let fetchPatched = false;

	// remote function calls go over plain fetch; counting the in-flight ones is
	// what lets e2e (and the differ) wait for "router idle" after interactions
	function patchFetchOnce() {
		if (fetchPatched || typeof window === "undefined") return;
		fetchPatched = true;

		const originalFetch = window.fetch.bind(window);
		window.fetch = async (input, init) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			const isAppRequest = url.includes("/_app/") || url.startsWith("/");
			if (isAppRequest) pendingRemoteRequests++;
			try {
				return await originalFetch(input, init);
			} finally {
				if (isAppRequest) pendingRemoteRequests--;
			}
		};
	}
</script>

<script lang="ts">
	import { navigating } from "$app/state";

	let hydrated = $state(false);

	$effect(() => {
		patchFetchOnce();
		hydrated = true;
	});

	const busy = $derived.by(() => {
		const parts: string[] = [];
		if (navigating.to) parts.push(`nav:${navigating.type ?? "navigating"}`);
		if (pendingRemoteRequests > 0) {
			parts.push(`remote:${pendingRemoteRequests}`);
		}
		return parts;
	});
</script>

{#if hydrated}
	<div
		style="display: none"
		data-testid="hydrated"
		data-router-idle={busy.length === 0 ? "true" : undefined}
		data-router-busy={busy.length === 0 ? undefined : busy.join(" | ")}
	></div>
{/if}
