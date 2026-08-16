<script lang="ts">
	import type { MainWeaponId } from "@sendou/in-game-lists/types";
	import { mainWeaponName } from "#lib/modules/i18n/messages.ts";
	import {
		mainWeaponImageUrl,
		outlinedFiveStarMainWeaponImageUrl,
		outlinedMainWeaponImageUrl,
		outlinedTenStarMainWeaponImageUrl,
	} from "#lib/utils/urls.ts";
	import Image from "./Image.svelte";

	type WeaponWithStars = {
		weaponSplId: MainWeaponId;
		isFavorite?: boolean | number;
		isTenStar?: boolean | number;
	};

	interface Props {
		weaponSplId?: MainWeaponId;
		weapon?: WeaponWithStars;
		variant?: "badge" | "badge-5-star" | "badge-10-star" | "build";
		title?: string;
		class?: string;
		width?: number;
		height?: number;
		size?: number;
		testId?: string;
		loading?: "lazy" | "eager";
	}

	let {
		weaponSplId: weaponSplIdProp,
		weapon,
		variant: variantProp,
		title,
		...rest
	}: Props = $props();

	const weaponSplId = $derived(weapon?.weaponSplId ?? weaponSplIdProp!);
	const variant = $derived(
		variantProp ?? (weapon ? resolveWeaponBadgeVariant(weapon) : "badge"),
	);
	const label = $derived(title ?? mainWeaponName(weaponSplId));
	const path = $derived(
		variant === "badge"
			? outlinedMainWeaponImageUrl(weaponSplId)
			: variant === "badge-5-star"
				? outlinedFiveStarMainWeaponImageUrl(weaponSplId)
				: variant === "badge-10-star"
					? outlinedTenStarMainWeaponImageUrl(weaponSplId)
					: mainWeaponImageUrl(weaponSplId),
	);

	function resolveWeaponBadgeVariant(weapon: WeaponWithStars) {
		if (weapon.isFavorite && weapon.isTenStar) return "badge-10-star" as const;
		if (weapon.isFavorite) return "badge-5-star" as const;
		return "badge" as const;
	}
</script>

<Image {...rest} alt={label} title={label} {path} />
