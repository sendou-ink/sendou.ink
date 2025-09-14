<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Clock from '@lucide/svelte/icons/clock';

	interface Props {
		status: 'OK' | 'MISSING' | 'WAIT';
		/** For position sticky, offset from top */
		top?: number;
	}

	const { status, top }: Props = $props();
</script>

<div class={status} style={`--top: ${top ?? 0}px`}>
	{#if status === 'OK'}
		<Check />
	{:else if status === 'MISSING'}
		<X />
	{:else}
		<Clock />
	{/if}
</div>

<style>
	.OK {
		--status-circle-color: var(--color-success);
		--status-circle-bg: var(--color-success-transparent);
	}

	.MISSING {
		--status-circle-color: var(--color-error);
		--status-circle-bg: var(--color-error-transparent);
	}

	.WAIT {
		--status-circle-color: var(--color-info);
		--status-circle-bg: var(--color-info-transparent);
	}

	div {
		border: 3px solid var(--status-circle-color);
		background-color: var(--status-circle-bg);
		border-radius: 100%;
		display: grid;
		place-items: center;
		width: 48px;
		height: 48px;
		position: sticky;
		top: var(--top);

		:global(svg) {
			color: var(--status-circle-color);
			stroke-width: 2.5px;
		}
	}
</style>
