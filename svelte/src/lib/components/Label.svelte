<script lang="ts">
import type { Snippet } from "svelte";
import type { ClassValue } from "svelte/elements";

interface Props {
	children: Snippet;
	for?: string;
	valueLimits?: { current: number; max: number };
	required?: boolean;
	class?: ClassValue;
	spaced?: boolean;
}

let {
	children,
	for: htmlFor,
	valueLimits,
	required,
	class: className,
	spaced = true,
}: Props = $props();

const lengthState = $derived.by(() => {
	if (!valueLimits) return undefined;
	if (valueLimits.current > valueLimits.max) return "error";
	if (valueLimits.current / valueLimits.max >= 0.9) return "warning";

	return undefined;
});
</script>

<div class={["container", className, !spaced && "mb-0"]}>
	<label for={htmlFor}>
		{@render children()}
		{#if required}<span class="text-error">*</span>{/if}
	</label>
	{#if valueLimits}
		<div
			class={["value", lengthState]}
			data-testid="label-value-counter"
			data-length-state={lengthState}
		>
			{valueLimits.current}/{valueLimits.max}
		</div>
	{/if}
</div>

<style>
	@layer components {
		.container {
			display: flex;
			align-items: flex-end;
			gap: var(--s-2);
			margin-block-end: var(--label-margin);

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

		.warning {
			color: var(--color-warning);
		}

		.error {
			color: var(--color-error);
		}
	}
</style>
