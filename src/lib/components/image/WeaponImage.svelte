<script lang="ts">
	import { asset } from '$app/paths';
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import type { HTMLImgAttributes } from 'svelte/elements';
	import { weaponTranslations } from '$lib/utils/i18n';

	type Props = {
		weaponSplId: MainWeaponId;
		variant: 'badge' | 'badge-5-star' | 'build';
		size?: number;
	} & Omit<HTMLImgAttributes, 'src'>;

	let { weaponSplId, variant, width, height, size, ...rest }: Props = $props();

	const src = $derived.by(() => {
		if (variant === 'badge') return asset(`/img/main-weapons-outlined/${weaponSplId}.avif`);
		if (variant === 'badge-5-star')
			return asset(`/img/main-weapons-outlined-2/${weaponSplId}.avif`);
		return asset(`/img/main-weapons/${weaponSplId}.avif`);
	});
</script>

<img
	{src}
	alt={weaponTranslations[weaponSplId]()}
	title={weaponTranslations[weaponSplId]()}
	width={width ?? size}
	height={height ?? size}
	{...rest}
/>
