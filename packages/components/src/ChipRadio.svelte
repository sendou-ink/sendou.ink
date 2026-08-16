<script lang="ts">
import type { Snippet } from "svelte";

interface Props {
	name: string;
	value: string;
	checked: boolean;
	onChange: (value: string) => void;
	children: Snippet;
}

let { name, value, checked, onChange, children }: Props = $props();

const id = $derived(`chip-radio-${name}-${value}`);
</script>

<input
	type="radio"
	{id}
	{name}
	{value}
	{checked}
	onchange={() => onChange(value)}
	class="radio"
/>
<label for={id} class="label">
	{@render children()}
</label>

<style>
	.label {
		font-size: var(--font-xs);
		font-weight: var(--weight-semi);
		padding: 0 var(--s-2);
		height: var(--selector-size);
		border-radius: var(--radius-selector);
		background-color: var(--color-bg-higher);
		color: var(--color-text);
		cursor: pointer;
		transition: background-color 0.15s;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.radio {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;

		&:focus-visible + .label {
			outline: var(--focus-ring);
			outline-offset: 2px;
		}

		&:checked + .label {
			background-color: var(--color-text-accent);
			color: var(--color-text-inverse);
		}
	}
</style>
