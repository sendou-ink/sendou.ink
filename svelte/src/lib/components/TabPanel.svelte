<script lang="ts">
import type { Snippet } from "svelte";
import type { ClassValue } from "svelte/elements";
import { getTabsContext } from "./tabs-context.ts";

interface Props {
	id: string;
	class?: ClassValue;
	children?: Snippet;
}

let { id, class: className, children }: Props = $props();

const tabs = getTabsContext();
</script>

{#if tabs.selectedKey === id}
	<div
		class={[className, "tab-panel"]}
		role="tabpanel"
		id={`tabpanel-${id}`}
		aria-labelledby={`tab-${id}`}
	>
		{@render children?.()}
	</div>
{/if}

<style>
	@layer elements {
		:global(.vertical) .tab-panel {
			min-width: 0;
		}
	}
</style>
