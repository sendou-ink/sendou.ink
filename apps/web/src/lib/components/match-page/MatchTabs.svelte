<script lang="ts">
import { BarChart3, Key, ScrollText, Tally5, Users } from "@lucide/svelte";
import { Tab, TabList, Tabs } from "@sendou/components";
import invariant from "@sendou/utils/invariant";
import type { Component, Snippet } from "svelte";
import { searchParamsState } from "#lib/modules/search-params/search-params-state.svelte.ts";
import { m } from "#lib/paraglide/messages.js";
import type { MatchTabsKey } from "./match-page-constants.ts";
import { matchPageSearchParams } from "./match-page-search-params.ts";

const TAB_ICONS: Record<MatchTabsKey, Component> = {
	rosters: Users,
	action: Tally5,
	result: ScrollText,
	stats: BarChart3,
	admin: Key,
};

const TAB_LABELS: Record<MatchTabsKey, () => string> = {
	rosters: m.q_match_tabs_rosters,
	action: m.q_match_tabs_action,
	result: m.q_match_tabs_result,
	stats: m.q_match_tabs_stats,
	admin: m.common_pages_admin,
};

interface Props {
	children: Snippet;
	tabs: Array<MatchTabsKey>;
	/** Tabs that should show a warning-colored alert icon to draw attention. */
	alertTabs?: Array<MatchTabsKey>;
}

let { children, tabs, alertTabs }: Props = $props();

const params = searchParamsState(matchPageSearchParams);

const currentTab = $derived.by(() => {
	const tab = tabs.find((tab) => params.current.tab === tab) ?? tabs.at(0);
	invariant(tab);
	return tab;
});
</script>

<div class="root">
	<Tabs
		selectedKey={currentTab}
		onSelectionChange={(key) => params.set({ tab: key as MatchTabsKey })}
		disappearing={false}
		padded={false}
	>
		<TabList>
			{#each tabs as tab (tab)}
				{@const Icon = TAB_ICONS[tab]}
				<Tab id={tab} alert={alertTabs?.includes(tab)}>
					{#snippet icon()}<Icon />{/snippet}
					{TAB_LABELS[tab]()}
				</Tab>
			{/each}
		</TabList>

		{@render children()}
	</Tabs>
</div>

<style>
	.root :global([class*="tabPanel"]) {
		background-color: var(--color-bg-high);
		border-radius: 0 0 var(--radius-box) var(--radius-box);
		padding: var(--s-6) var(--s-4);
	}
</style>
