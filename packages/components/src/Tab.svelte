<script lang="ts">
import type { Snippet } from "svelte";
import { getTabsContext } from "./tabs-context.ts";

interface Props {
	id: string;
	icon?: Snippet;
	number?: number;
	/** Render a warning-colored alert icon to draw attention to this tab. */
	alert?: boolean;
	children?: Snippet;
}

let { id, icon, number, alert, children }: Props = $props();

const tabs = getTabsContext();

const selected = $derived(tabs.selectedKey === id);

function onkeydown(event: KeyboardEvent) {
	const nextKey = tabs.orientation === "vertical" ? "ArrowDown" : "ArrowRight";
	const previousKey = tabs.orientation === "vertical" ? "ArrowUp" : "ArrowLeft";

	const direction =
		event.key === nextKey
			? ("next" as const)
			: event.key === previousKey
				? ("previous" as const)
				: event.key === "Home"
					? ("first" as const)
					: event.key === "End"
						? ("last" as const)
						: null;

	if (!direction) return;

	event.preventDefault();
	tabs.moveFocus(id, direction);
}

function registerTab(element: HTMLElement) {
	return tabs.registerTab(id, element);
}
</script>

<div
	class="tabContainer"
	role="tab"
	id="tab-{id}"
	aria-selected={selected}
	aria-controls="tabpanel-{id}"
	tabindex={selected ? 0 : -1}
	data-selected={selected ? "true" : undefined}
	onclick={() => tabs.select(id)}
	{onkeydown}
	{@attach registerTab}
>
	<div class="tabButton">
		{#if icon}{@render icon()}{/if}
		{#if children}{@render children()}{/if}
		{#if typeof number === "number" && number !== 0}
			<span class="tabNumber">{number}</span>
		{/if}
		{#if alert}
			<svg
				class="tabAlert"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
				<path d="M12 9v4" />
				<path d="M12 17h.01" />
			</svg>
		{/if}
	</div>
</div>
