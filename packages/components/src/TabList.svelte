<script lang="ts">
import type { Snippet } from "svelte";
import { getTabsContext } from "./tabs-context.ts";

interface Props {
	sticky?: boolean;
	/** Should tabs take 100% width with equal distribution? */
	fullWidth?: boolean;
	"aria-label"?: string;
	children: Snippet;
}

let { sticky, fullWidth, "aria-label": ariaLabel, children }: Props = $props();

const tabs = getTabsContext();
</script>

<div class="tabListContainer scrollbar">
	<div
		class={["tabList", { sticky, fullWidth }]}
		role="tablist"
		aria-label={ariaLabel}
		aria-orientation={tabs.orientation}
	>
		{@render children()}
	</div>
</div>
