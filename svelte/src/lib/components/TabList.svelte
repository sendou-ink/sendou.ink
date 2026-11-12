<script lang="ts">
import type { Snippet } from "svelte";
import { getTabsContext } from "./tabs-context.ts";

interface Props {
	sticky?: boolean;
	/** tabs share 100% width equally */
	fullWidth?: boolean;
	/** Controls shown at the end of the tab row, outside the tablist itself (horizontal orientation only). */
	actions?: Snippet;
	"aria-label"?: string;
	children: Snippet;
}

let {
	sticky,
	fullWidth,
	actions,
	"aria-label": ariaLabel,
	children,
}: Props = $props();

const tabs = getTabsContext();

function scrollSelectedTabIntoView(container: HTMLDivElement) {
	// tracked so that the selected tab is scrolled to whenever it changes
	if (tabs.selectedKey === null || tabs.orientation === "vertical") return;

	const selectedTab = container.querySelector<HTMLElement>(
		'[role="tab"][aria-selected="true"]',
	);
	if (!selectedTab) return;

	const containerRect = container.getBoundingClientRect();
	const tabRect = selectedTab.getBoundingClientRect();
	if (tabRect.left < containerRect.left) {
		container.scrollLeft -= containerRect.left - tabRect.left;
	} else if (tabRect.right > containerRect.right) {
		container.scrollLeft += tabRect.right - containerRect.right;
	}
}
</script>

{#snippet tabList()}
	<div class="tab-list-container" {@attach scrollSelectedTabIntoView}>
		<div
			class={["tab-list", sticky && "sticky", fullWidth && "full-width"]}
			role="tablist"
			aria-label={ariaLabel}
			aria-orientation={tabs.orientation}
		>
			{@render children()}
		</div>
	</div>
{/snippet}

{#if actions && tabs.orientation !== "vertical"}
	<div class="tab-list-row">
		{@render tabList()}
		<div class="tab-list-actions">{@render actions()}</div>
	</div>
{:else}
	{@render tabList()}
{/if}

<style>
	@layer elements {
		.tab-list-container {
			overflow-x: auto;
			overflow-y: hidden;
		}

		.tab-list-row {
			--tab-list-border-width: 2px;
			container-type: inline-size;
			display: flex;
			align-items: flex-end;

			& .tab-list-container {
				flex: 1;
				min-width: 0;
				/* tabs scrolled under the actions fade out, the underline stays solid */
				mask-image:
					linear-gradient(to right, #000 calc(100% - var(--s-6)), transparent),
					linear-gradient(#000, #000);
				mask-size:
					100% calc(100% - var(--tab-list-border-width)),
					100% var(--tab-list-border-width);
				mask-position: top, bottom;
				mask-repeat: no-repeat;
			}
		}

		.tab-list-actions {
			flex: none;
			display: flex;
			align-items: center;
			gap: var(--s-2);
			padding-inline-start: var(--s-2);
			padding-bottom: var(--s-1);
			border-bottom: var(--tab-list-border-width) solid var(--color-border);
		}

		@container (width < 640px) {
			.tab-list-actions::before {
				content: "";
				width: 2px;
				height: var(--s-4);
				border-radius: 1px;
				background-color: var(--color-border);
			}
		}

		.tab-list {
			display: flex;
			flex-direction: row;
			border-bottom: 2px solid var(--color-border);
			min-width: fit-content;

			& :global(svg) {
				--icon-size: 16px;
				min-width: var(--icon-size);
				min-height: var(--icon-size);
				max-width: var(--icon-size);
				max-height: var(--icon-size);
				margin-inline-end: var(--s-1-5);
			}
		}

		.full-width {
			width: 100%;
			min-width: 100%;

			& :global(.tab-container) {
				flex: 1;
				min-width: 0;
			}
		}

		.sticky {
			position: sticky;
			top: 47px;
			z-index: 1;
			background-color: var(--color-bg);
		}

		:global(.vertical) {
			& .tab-list-container {
				overflow: visible;
				position: sticky;
				top: var(--layout-sticky-top);
				align-self: start;
				background-color: var(--color-bg);
				z-index: 1;
			}

			& .tab-list {
				flex-direction: column;
				border-bottom: none;
				border-inline-end: 2px solid var(--color-border);
				min-width: 0;
			}
		}
	}
</style>
