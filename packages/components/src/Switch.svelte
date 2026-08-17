<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	id?: string;
	isSelected?: boolean;
	onChange?: (isSelected: boolean) => void;
	isDisabled?: boolean;
	children?: Snippet;
}

let { id, isSelected = false, onChange, isDisabled, children }: Props =
	$props();

let focusVisible = $state(false);
</script>

<label
	class="root"
	data-selected={isSelected || undefined}
	data-disabled={isDisabled || undefined}
	data-focus-visible={focusVisible || undefined}
>
	<input
		{id}
		type="checkbox"
		role="switch"
		class="input"
		checked={isSelected}
		disabled={isDisabled}
		onchange={(event) => onChange?.(event.currentTarget.checked)}
		onfocus={(event) => {
			focusVisible = event.currentTarget.matches(":focus-visible");
		}}
		onblur={() => {
			focusVisible = false;
		}}
	/>
	<div class="indicator"></div>
	{#if children}{@render children()}{/if}
</label>

<style>
	.input {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: 0;
		padding: 0;
		border: 0;
		clip-path: inset(50%);
		overflow: hidden;
		white-space: nowrap;
	}

	.indicator {
		width: calc(var(--height) * 1.75);
		height: var(--height);
		background: var(--color-bg);
		border: var(--border-style);
		border-radius: calc(var(--radius-selector) * 2);
		padding: 2px;
		display: inline-grid;
		justify-items: center;
		grid-template-columns: 0fr 1fr 1fr;
		transition: grid-template-columns 200ms;

		&:before {
			content: "";
			height: 100%;
			aspect-ratio: 1 / 1;
			background: var(--color-border);
			border-radius: var(--radius-selector);
			grid-row-start: 1;
			grid-column-start: 2;
		}
	}

	.root {
		--height: var(--selector-size-sm);

		position: relative;
		cursor: pointer;
		display: grid;
		grid-template-columns: auto 1fr;
		align-items: center;
		gap: 0.571rem;
		color: var(--text-color);
		forced-color-adjust: none;
		font-size: var(--font-xs);
		font-weight: var(--weight-bold);
		margin-block-end: 0;

		&[data-selected] .indicator {
			background: var(--color-text-accent);
			border-color: var(--color-text-accent);
			grid-template-columns: 1fr 1fr 0fr;

			&:before {
				background: var(--color-text-inverse);
			}
		}

		&[data-focus-visible] .indicator {
			outline: var(--focus-ring);
			outline-offset: 1px;
		}

		&[data-disabled] {
			cursor: not-allowed;

			& .indicator {
				opacity: 0.65;
			}
		}
	}
</style>
