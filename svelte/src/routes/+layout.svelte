<script lang="ts">
import "~/styles/fonts.css";
import "~/styles/vars.css";
import "~/styles/normalize.css";
import "~/styles/common.css";
import "~/styles/scrollbar.css";
import "~/styles/utils.css";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";
import Avatar from "#lib/components/Avatar.svelte";
import HydrationTestIndicator from "#lib/components/HydrationTestIndicator.svelte";
import ToastRegion from "#lib/components/ToastRegion.svelte";
import { refreshAll } from "$app/navigation";
import { getLoggedInUser } from "#lib/features/auth/auth.remote.ts";

let { children } = $props();

const user = $derived(await getLoggedInUser());

// scripts/measure.ts times hydration up to this mark, the React stand-in shell sets the same one; it revalidates
// the page through `__sveltekitRefreshAll` as it does the React app through React Router's `__reactRouterDataRouter`
$effect(() => {
	Object.assign(window, { __sveltekitRefreshAll: refreshAll });
	performance.mark("sendou:hydrated");
});
</script>

{#if IS_E2E_TEST_RUN}<HydrationTestIndicator />{/if}
<ToastRegion />
<!-- stand-in for the app shell (side nav, search, chat, notifications), which this slice does not port -->
<div class="container">
	<header class="header" data-stand-in-shell>
		<a href="/" class="site-name" data-sveltekit-reload>sendou.ink</a>
		{#if user}
			<Avatar {user} size="xxsm" alt={user.username} />
		{/if}
	</header>
	{@render children()}
</div>

<style>
	@layer components {
		.container {
			flex: 1;
			min-width: 0;
		}

		.header {
			display: flex;
			width: 100%;
			height: var(--layout-nav-height);
			align-items: center;
			justify-content: space-between;
			border-bottom: 1.5px solid var(--color-border);
			background-color: var(--color-bg-nav);
			font-weight: var(--weight-extra);
			padding-inline: var(--s-4);
			position: sticky;
			top: 0;
			z-index: 10;
		}

		.site-name {
			color: var(--color-text);
		}
	}
</style>
