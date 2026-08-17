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
import UnsavedChangesGuard from "#lib/form/UnsavedChangesGuard.svelte";
import PwaLinks from "#lib/components/PwaLinks.svelte";
import ThemeHead from "#lib/features/theme/ThemeHead.svelte";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { navigating } from "$app/state";
import type { LayoutProps } from "./$types";

const LOADING_INDICATOR_DELAY_MS = 150;

let { data, children }: LayoutProps = $props();

const theme = $derived(data.theme ?? null);

NProgress.configure({ parent: "#nprogress-anchor", showSpinner: false });

let startTimeout: ReturnType<typeof setTimeout> | null = null;

beforeNavigate((navigation) => {
	// `complete` never settles for a navigation that unloads the document
	if (navigation.willUnload) return;

	startTimeout ??= setTimeout(() => {
		NProgress.start();
	}, LOADING_INDICATOR_DELAY_MS);

	// an aborted navigation gets no `afterNavigate`, but the navigation that
	// superseded it will, and the indicator should stay up until then
	navigation.complete.catch(() => {
		if (!navigating.to) stopLoadingIndicator();
	});
});

afterNavigate(stopLoadingIndicator);

function stopLoadingIndicator() {
	if (startTimeout) {
		clearTimeout(startTimeout);
		startTimeout = null;
	}

	NProgress.done();
}
</script>

<ThemeHead {theme} />
<PwaLinks />

{#if IS_E2E_TEST_RUN}
	<HydrationTestIndicator />
{/if}

<UnsavedChangesGuard />

<Layout>
	{@render children()}
</Layout>
