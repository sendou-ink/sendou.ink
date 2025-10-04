<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLLabelAttributes } from 'svelte/elements';

	interface Props extends HTMLLabelAttributes {
		children: Snippet;
		valueLimits?: {
			current?: number;
			max: number;
		};
		required?: boolean;
	}

	let { children, valueLimits, required, ...rest }: Props = $props();

	function lengthWarning(valueLimits: NonNullable<Props['valueLimits']>) {
		if (!valueLimits.current) return;

		if (valueLimits.current > valueLimits.max) return 'error';
		if (valueLimits.current / valueLimits.max >= 0.9) return 'warning';

		return;
	}
</script>

<div class="container">
	<label {...rest}>
		{@render children()}
		{#if required}
			<span class="text-error">*</span>
		{/if}
	</label>
	{#if valueLimits}
		<div class={['value', lengthWarning(valueLimits)]}>
			{valueLimits.current ?? 0}/{valueLimits.max}
		</div>
	{/if}
</div>

<style>
	label {
		display: block;
		font-size: var(--fonts-xs);
		font-weight: var(--bold);
	}

	.container {
		display: flex;
		align-items: flex-end;
		gap: var(--s-2);
		user-select: none;
	}

	.value {
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xxs);
		font-weight: var(--body);
		margin-block-start: -5px;
	}

	.value.warning {
		color: var(--color-warning);
	}

	.value.error {
		color: var(--color-error);
	}
</style>
