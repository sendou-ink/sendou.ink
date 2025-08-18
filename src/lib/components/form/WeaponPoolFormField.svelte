<script lang="ts">
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import type { FormFieldProps } from '$lib/form/types';
	import { weaponTranslations } from '$lib/utils/i18n';
	import Button from '../buttons/Button.svelte';
	import WeaponSelect from '../WeaponCombobox.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Star from '@lucide/svelte/icons/star';
	import { asset } from '$app/paths';

	export interface WeaponPool {
		id: MainWeaponId;
		isFavorite: boolean;
	}

	type Props = FormFieldProps<'weapon-pool'> & {
		value: WeaponPool[];
		onblur?: () => void;
	};

	let { label, name, bottomText, error, onblur, value = $bindable(), maxCount }: Props = $props();
	const id = $props.id();
</script>

<div class="stack xs">
	<Label for={id}>
		{label}
	</Label>
	<WeaponSelect
		{id}
		disabled={value.length >= maxCount}
		disabledWeaponIds={value.map((weapon) => weapon.id)}
		onselect={(id, clear) => {
			value.push({
				id,
				isFavorite: false
			});

			clear();
			onblur?.();
		}}
	/>
	<input type="hidden" {name} value={JSON.stringify(value ?? [])} />

	<ol>
		{#each value as weapon (weapon.id)}
			{@render weaponRow(weapon)}
		{/each}
	</ol>

	<BottomText info={bottomText} {error} fieldId={id} />
</div>

{#snippet weaponRow({ id, isFavorite }: { id: MainWeaponId; isFavorite: boolean })}
	<li>
		<div class="line"></div>
		<img
			src={isFavorite
				? asset(`/img/main-weapons-outlined-2/${id}.avif`)
				: asset(`/img/main-weapons-outlined/${id}.avif`)}
			width={32}
			height={32}
			loading="lazy"
			alt=""
		/>
		<span class="weapon-row-text">
			{weaponTranslations[id]()}
		</span>
		<div class="icons ml-auto stack horizontal md">
			<Button
				class={isFavorite ? 'favorite' : ''}
				icon={Star}
				variant="minimal-secondary"
				onclick={() => {
					const item = value.find((weapon) => weapon.id === id);
					if (item) {
						item.isFavorite = !item.isFavorite;
					}
				}}
				size="small"
			/>
			<Button
				icon={Trash2}
				variant="minimal-destructive"
				onclick={() => {
					value = value.filter((weapon) => weapon.id !== id);
					onblur?.();
				}}
				size="small"
			/>
		</div>
	</li>
{/snippet}

<style>
	ol {
		padding-left: var(--s-8);
	}

	.line {
		width: 4px;
		height: 45px;
		background-color: var(--color-base-card);
		margin-inline-start: -15px;
		margin-block: -2px;
		border-radius: 0 0 var(--radius-box) var(--radius-box);
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-left: none;
		max-width: 254px;
	}

	.weapon-row-text {
		text-transform: uppercase;
		font-weight: var(--semi-bold);
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xxs);
		max-width: 8rem;
		min-width: 8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		text-wrap: nowrap;
	}

	.icons :global(.favorite svg) {
		fill: currentColor;
	}
</style>
