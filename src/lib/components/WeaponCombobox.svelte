<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { weaponCategories } from '$lib/constants/in-game/weapon-ids';
	import { weaponAltNames } from '$lib/constants/in-game/weapon-alt-names';
	import { mainWeaponImageUrl, weaponCategoryUrl } from '$lib/utils/urls';
	import { weaponCategoryTranslations, weaponTranslations } from '$lib/utils/i18n';
	import Combobox, { type Item } from './Combobox.svelte';
	import type { MainWeaponId } from '$lib/constants/in-game/types';

	interface Props {
		open?: boolean;
		value?: MainWeaponId;
		onselect?: (item: MainWeaponId) => void;
		onblur?: VoidFunction;
		disabledWeaponIds?: Array<MainWeaponId>;
		id?: string;
	}

	let {
		open = $bindable(false),
		value = $bindable(undefined),
		onselect,
		onblur,
		id,
		disabledWeaponIds
	}: Props = $props();

	const data = $derived(
		weaponCategories.map((category) => ({
			label: weaponCategoryTranslations[category.name](),
			image: weaponCategoryUrl(category.name),
			items: category.weaponIds.map((weaponId) => ({
				value: weaponTranslations[weaponId](),
				label: weaponTranslations[weaponId](),
				image: mainWeaponImageUrl(weaponId),
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

	function handleSelect(item: Item) {
		// @ts-expect-error TODO: this could be made more typesafe by making Combobox accept a generic
		onselect?.(item.id);
	}
</script>

<Combobox
	bind:open
	bind:value={
		() =>
			value
				? data
						.flatMap((category) => category.items)
						.find((item) => item.value === weaponTranslations[value]())
				: undefined,
		(item) => item?.id
	}
	{id}
	{data}
	onselect={handleSelect}
	{onblur}
	buttonPlaceholder={m.common_forms_weaponSearch_placeholder()}
	searchPlaceholder={m.common_forms_weaponSearch_search_placeholder()}
/>
