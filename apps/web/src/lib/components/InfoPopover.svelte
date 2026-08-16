<script lang="ts">
import { Popover } from "@sendou/components";
import type { Snippet } from "svelte";

interface Props {
	children: Snippet;
	tiny?: boolean;
	class?: string;
}

let { children, tiny = false, class: className }: Props = $props();
</script>

<Popover>
	{#snippet trigger(triggerProps)}
		<button
			type="button"
			class={["trigger", className, { triggerTiny: tiny }]}
			aria-expanded={triggerProps["aria-expanded"]}
			aria-haspopup={triggerProps["aria-haspopup"]}
			onclick={triggerProps.onclick}
		>
			?
		</button>
	{/snippet}
	{@render children()}
</Popover>

<style>
	.trigger {
		border: var(--border-style-high);
		border-radius: 100%;
		background-color: transparent;
		color: var(--color-text);
		font-size: var(--font-md);
		padding: var(--s-0-5);
		width: var(--selector-size);
		height: var(--selector-size);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;

		&:focus-visible {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}
	}

	.triggerTiny {
		width: var(--selector-size-sm);
		height: var(--selector-size-sm);
		font-size: var(--font-xs);
	}
</style>
