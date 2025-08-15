<script lang="ts">
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import type { FormFieldProps } from '$lib/form/types';
	import { weaponTranslations } from '$lib/utils/i18n';
	import { outlinedFiveStarMainWeaponImageUrl, outlinedMainWeaponImageUrl } from '$lib/utils/urls';
	import Button from '../buttons/Button.svelte';
	import Image from '../image/Image.svelte';
	import WeaponSelect from '../WeaponCombobox.svelte';
	import BottomText from './BottomText.svelte';
	import Label from './Label.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Star from '@lucide/svelte/icons/star';

	export interface WeaponPool {
		weaponSplId: MainWeaponId;
		isFavorite: boolean;
	}

	type Props = FormFieldProps<'weapon-pool'> & {
		value: WeaponPool[];
		onblur?: () => void;
	};

	let { label, name, bottomText, error, onblur, value = $bindable() }: Props = $props();
	const id = $props.id();
</script>

<!-- xxx: handle max reached -->
<div class="stack xs">
	<Label for={id}>
		{label}
	</Label>
	<WeaponSelect
		{id}
		{onblur}
		disabledWeaponIds={value.map((weapon) => weapon.weaponSplId)}
		onselect={(weaponSplId) => {
			value.push({
				weaponSplId,
				isFavorite: false
			});

			// xxx: also clear the current input selected value (can we do it without key block?)
		}}
	/>
	<input type="hidden" {name} value={JSON.stringify(value ?? [])} />

	<ol>
		{#each value as weapon (weapon.weaponSplId)}
			{@render weaponRow(weapon)}
		{/each}
	</ol>

	<BottomText info={bottomText} {error} fieldId={id} />
</div>

{#snippet weaponRow({
	weaponSplId,
	isFavorite
}: {
	weaponSplId: MainWeaponId;
	isFavorite: boolean;
})}
	<li>
		<div class="line"></div>
		<Image
			path={isFavorite
				? outlinedFiveStarMainWeaponImageUrl(weaponSplId)
				: outlinedMainWeaponImageUrl(weaponSplId)}
			size={32}
			lazy
		/>
		<span class="weapon-row-text">
			{weaponTranslations[weaponSplId]()}
		</span>
		<div class="icons ml-auto stack horizontal md">
			<Button
				class={isFavorite ? 'favorite' : ''}
				icon={Star}
				variant="minimal-secondary"
				onclick={() => {
					const item = value.find((weapon) => weapon.weaponSplId === weaponSplId);
					if (item) {
						item.isFavorite = !item.isFavorite;
					}
				}}
				size="small"
			/>
			<Button
				icon={Trash2}
				variant="minimal-destructive"
				onclick={() => (value = value.filter((weapon) => weapon.weaponSplId !== weaponSplId))}
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
