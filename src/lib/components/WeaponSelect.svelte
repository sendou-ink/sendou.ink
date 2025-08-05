<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import { weaponCategories } from '$lib/constants/in-game/weapon-ids';
	import { mainWeaponImageUrl, weaponCategoryUrl } from '$lib/utils/urls';
	import { weaponAltNames } from '$lib/constants/in-game/weapon-alt-names';
	import Combobox from './Combobox.svelte';

	const data = weaponCategories.map((category) => ({
		label: category.name,
		image: weaponCategoryUrl(category.name),
		items: category.weaponIds.map((weaponId) => ({
			value: weaponId.toString(),
			label: weaponId.toString(),
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
	{data}
	title={m.builds_forms_weapons()}
	buttonPlaceholder={m.common_forms_weaponSearch_placeholder()}
	searchPlaceholder={m.common_forms_weaponSearch_search_placeholder()}
/>
