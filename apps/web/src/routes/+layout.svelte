<script lang="ts">
	import "#lib/styles/fonts.css";
	import "#lib/styles/vars.css";
	import "#lib/styles/normalize.css";
	import "#lib/styles/common.css";
	import "#lib/styles/utils.css";
	import "#lib/styles/flags.css";
	import "nprogress/nprogress.css";

	import NProgress from "nprogress";
	import { navigating, page } from "$app/state";
	import HydrationTestIndicator from "#lib/components/HydrationTestIndicator.svelte";
	import Layout from "#lib/components/layout/Layout.svelte";
	import PwaLinks from "#lib/components/PwaLinks.svelte";
	import ThemeHead from "#lib/features/theme/ThemeHead.svelte";
	import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";

	let { children } = $props();

	const theme = $derived(
		(page.data as { theme?: "dark" | "light" | null }).theme ?? null,
	);

	NProgress.configure({ parent: `#nprogress-anchor`, showSpinner: false });

	$effect(() => {
		if (navigating.to) {
			NProgress.start();
		} else {
			NProgress.done();
		}
	});
</script>

<ThemeHead {theme} />
<PwaLinks />

{#if IS_E2E_TEST_RUN}
	<HydrationTestIndicator />
{/if}

<Layout>
	{@render children()}
</Layout>
