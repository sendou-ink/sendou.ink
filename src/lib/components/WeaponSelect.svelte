<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { weaponCategories } from '$lib/constants/in-game/weapon-ids';
	import { weaponAltNames } from '$lib/constants/in-game/weapon-alt-names';
	import { mainWeaponImageUrl, weaponCategoryUrl } from '$lib/utils/urls';
	import { weaponCategoryTranslations, weaponTranslations } from '$lib/utils/i18n';
	import Combobox, { type Item } from './Combobox.svelte';

	interface Props {
		open?: boolean;
		value?: Item;
		onselect?: (item: Item) => void;
		id?: string;
	}

	let { open = $bindable(false), value = $bindable(undefined), onselect, id }: Props = $props();

	const data = weaponCategories.map((category) => ({
		label: weaponCategoryTranslations[category.name](),
		image: weaponCategoryUrl(category.name),
		items: category.weaponIds.map((weaponId) => ({
			value: weaponTranslations[weaponId](),
			label: weaponTranslations[weaponId](),
			image: mainWeaponImageUrl(weaponId),
			keywords: (() => {
				const altNames = weaponAltNames.get(weaponId);
				if (!altNames) return [];
				return Array.isArray(altNames) ? altNames : [altNames];
			})()
		}))
	}));
</script>

<Combobox
	bind:open
	bind:value
	{id}
	{data}
	{onselect}
	searchPlaceholder={m.common_forms_weaponSearch_search_placeholder()}
/>
