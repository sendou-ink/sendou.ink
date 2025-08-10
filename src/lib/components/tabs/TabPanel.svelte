<script lang="ts">
	import { Tabs } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		value: string;
	}

	let { children, value }: Props = $props();
</script>

<Tabs.Content {value}>
	{#snippet child({ props })}
		<div {...props}>
			{@render children()}
		</div>
	{/snippet}
</Tabs.Content>

<style>
	div {
		padding-block-start: var(--s-4);
	}

	/* xxx: disappearing style */
	/* .disappearing:has(.tab-list .tab-button:only-child).padded .tab-panel {
		padding-top: 0;
	} */
</style>
