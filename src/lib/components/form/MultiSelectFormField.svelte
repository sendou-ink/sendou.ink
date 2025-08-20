<script lang="ts">
	import type { FormFieldProps } from '$lib/form/types';
	import { slide } from 'svelte/transition';
	import Button from '../buttons/Button.svelte';
	import BottomText from './BottomText.svelte';
	import SelectFormField from './SelectFormField.svelte';
	import X from '@lucide/svelte/icons/x';

	type Props = FormFieldProps<'multi-select'> & {
		value: string[];
	};

	let { name, bottomText, error, onblur, value = $bindable(), items, label }: Props = $props();
	const id = $props.id();

	let selectValue = $derived(null);

	const itemsPicked = $derived(value.map((v) => items.find((item) => item.value === v)!));
	const itemsAvailable = $derived(items.filter((item) => !value.includes(item.value)));
</script>

<div class="stack xs">
	<div class="stack sm">
		<div class="stack horizontal md">
			<SelectFormField
				{id}
				items={itemsAvailable}
				{label}
				{onblur}
				clearable
				bind:value={selectValue}
				onSelect={(selectedValue) => {
					value.push(selectedValue);
					selectValue = null;
				}}
			/>
		</div>
		{#if value.length > 0}
			<ol>
				{#each itemsPicked as item, idx (item.value)}
					<li in:slide={{ duration: 250 }}>
						{idx + 1}) {item.label}
						<Button
							icon={X}
							variant="minimal-destructive"
							size="small"
							onclick={() => {
								value = value.filter((v) => v !== item.value);
								selectValue = null;
							}}
						/>
					</li>
				{/each}
			</ol>
			<input type="hidden" {name} value={JSON.stringify(value)} />
		{/if}
	</div>
	<BottomText info={bottomText} {error} fieldId={id} />
</div>

<style>
	ol {
		display: flex;
		flex-direction: row;
		padding: 0;
		gap: var(--s-2);
		flex-wrap: wrap;
	}

	li {
		all: unset;
		font-size: var(--fonts-xs);
		font-weight: var(--semi-bold);
		background-color: var(--color-base-card);
		padding: var(--s-1) var(--s-2);
		border-radius: var(--radius-field);
		display: flex;
		align-items: center;
		gap: var(--s-2);

		:global(svg) {
			stroke-width: 4px;
		}
	}
</style>
