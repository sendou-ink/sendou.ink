<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { weaponCategories } from '$lib/constants/in-game/weapon-ids';
	import { weaponAltNames } from '$lib/constants/in-game/weapon-alt-names';
	import { weaponCategoryTranslations, weaponTranslations } from '$lib/utils/i18n';
	import Combobox, { type Item } from './Combobox.svelte';
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import { asset } from '$app/paths';

	interface Props {
		open?: boolean;
		value?: MainWeaponId;
		onselect?: (item: MainWeaponId, clear: () => void) => void;
		disabled?: boolean;
		disabledWeaponIds?: Array<MainWeaponId>;
		id?: string;
	}

	let {
		open = $bindable(false),
		value = $bindable(undefined),
		onselect,
		disabled,
		disabledWeaponIds,
		id
	}: Props = $props();

	const data = $derived(
		weaponCategories.map((category) => ({
			label: weaponCategoryTranslations[category.name](),
			image: asset(`/img/weapon-categories/${category.name}.avif`),
			items: category.weaponIds.map((weaponId) => ({
				value: weaponTranslations[weaponId](),
				label: weaponTranslations[weaponId](),
				image: asset(`/img/main-weapons/${weaponId}.avif`),
				disabled: disabledWeaponIds?.includes(weaponId),
				id: weaponId,
				keywords: (() => {
					const altNames = weaponAltNames.get(weaponId);
					if (!altNames) return [];
					return Array.isArray(altNames) ? altNames : [altNames];
				})()
			}))
		}))
	);

	function onSelect(item: Item) {
		// @ts-expect-error TODO: this could be made more typesafe by making Combobox accept a generic
		onselect?.(item.id, () => {
			value = undefined;
		});
	}
</script>

<Combobox
	bind:open
	bind:value={
		() =>
			value ? data.flatMap((group) => group.items).find((item) => item.id === value) : undefined,
		(item) => (value = item?.id)
	}
	{id}
	{data}
	{disabled}
	onselect={onSelect}
	buttonPlaceholder={m.common_forms_weaponSearch_placeholder()}
	searchPlaceholder={m.common_forms_weaponSearch_search_placeholder()}
/>
