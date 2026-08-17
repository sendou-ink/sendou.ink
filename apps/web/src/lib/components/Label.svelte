<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	htmlFor?: string;
	valueLimits?: {
		current: number;
		max: number;
	};
	required?: boolean;
	class?: string;
	labelClassName?: string;
	spaced?: boolean;
	children: Snippet;
}

let {
	htmlFor,
	valueLimits,
	required,
	class: className,
	labelClassName,
	spaced = true,
	children,
}: Props = $props();

const lengthWarningClass = $derived.by(() => {
	if (!valueLimits) return undefined;
	if (valueLimits.current > valueLimits.max) return "valueError";
	if (valueLimits.current / valueLimits.max >= 0.9) return "valueWarning";
	return undefined;
});
</script>

<div class={["container", className, { "mb-0": !spaced }]}>
	<label for={htmlFor} class={labelClassName}>
		{@render children()}
		{#if required}<span class="text-error">*</span>{/if}
	</label>
	{#if valueLimits}
		<div class={["value", lengthWarningClass]}>
			{valueLimits.current}/{valueLimits.max}
		</div>
	{/if}
</div>

<style>
	.container {
		display: flex;
		align-items: flex-end;
		gap: var(--s-2);
		margin-block-end: var(--label-margin);

		&.mb-0 {
			margin-block-end: 0;
		}

		& > label {
			margin: 0;
			text-box: trim-start cap alphabetic;
		}
	}

	.value {
		color: var(--color-text-high);
		font-size: var(--font-2xs);
		margin-block-start: -5px;
	}

	.valueWarning {
		color: var(--color-warning);
	}

	.valueError {
		color: var(--color-error);
	}
</style>
