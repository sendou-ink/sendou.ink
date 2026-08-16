<script lang="ts">
import "#lib/styles/fonts.css";
import "#lib/styles/vars.css";
import "#lib/styles/normalize.css";
import "#lib/styles/common.css";
import "#lib/styles/utils.css";
import "#lib/styles/flags.css";
import "nprogress/nprogress.css";

import NProgress from "nprogress";
import HydrationTestIndicator from "#lib/components/HydrationTestIndicator.svelte";
import Layout from "#lib/components/layout/Layout.svelte";
import PwaLinks from "#lib/components/PwaLinks.svelte";
import ThemeHead from "#lib/features/theme/ThemeHead.svelte";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";
import { navigating } from "$app/state";
import type { LayoutProps } from "./$types";

const LOADING_INDICATOR_DELAY_MS = 150;

let { data, children }: LayoutProps = $props();

const theme = $derived(data.theme ?? null);

NProgress.configure({ parent: "#nprogress-anchor", showSpinner: false });

const isNavigating = $derived(Boolean(navigating.to));

$effect(() => {
	const navigationOngoing = isNavigating;

	const timeout = setTimeout(() => {
		if (navigationOngoing) {
			NProgress.start();
		} else {
			NProgress.done();
		}
	}, LOADING_INDICATOR_DELAY_MS);

	return () => clearTimeout(timeout);
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
