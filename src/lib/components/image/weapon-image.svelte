<script lang="ts">
	import type { ImageProps } from '$lib/components/image/image.svelte';
	import Image from '$lib/components/image/image.svelte';
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import { weaponTranslations } from '$lib/utils/i18n';
	import {
		mainWeaponImageUrl,
		outlinedFiveStarMainWeaponImageUrl,
		outlinedMainWeaponImageUrl
	} from '$lib/utils/urls';

	type Props = {
		weaponSplId: MainWeaponId;
		variant: 'badge' | 'badge-5-star' | 'build';
	} & Omit<ImageProps, 'path'>;

	let { weaponSplId, variant, ...rest }: Props = $props();

	const path = $derived(
		variant === 'badge'
			? outlinedMainWeaponImageUrl(weaponSplId)
			: variant === 'badge-5-star'
				? outlinedFiveStarMainWeaponImageUrl(weaponSplId)
				: mainWeaponImageUrl(weaponSplId)
	);
</script>

<Image
	{path}
	alt={weaponTranslations[weaponSplId]()}
	title={weaponTranslations[weaponSplId]()}
	{...rest}
/>
