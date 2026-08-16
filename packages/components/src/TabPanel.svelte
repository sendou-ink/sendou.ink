<script lang="ts">
import type { Snippet } from "svelte";
import { getTabsContext } from "./tabs-context.ts";

interface Props {
	id: string;
	class?: string;
	children: Snippet;
}

let { id, class: className, children }: Props = $props();

const tabs = getTabsContext();

const selected = $derived(tabs.selectedKey === id);
</script>

{#if selected}
	<div
		class={[className, "tabPanel"]}
		role="tabpanel"
		id="tabpanel-{id}"
		aria-labelledby="tab-{id}"
	>
		{@render children()}
	</div>
{/if}
