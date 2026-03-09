import { isSupporter } from "~/modules/permissions/utils";

interface SortBadgesByFavoritesArgs<T extends { id: number }[]> {
	favoriteBadgeIds: number[] | null;
	badges: T;
	patronTier: number | null;
}

export function sortBadgesByFavorites<T extends { id: number }[]>({
	favoriteBadgeIds,
	badges,
	patronTier,
}: SortBadgesByFavoritesArgs<T>): {
	badges: T;
	favoriteBadgeIds: number[] | null;
} {
	// filter out favorite badges no longer owner of
	let filteredFavoriteIds =
		favoriteBadgeIds?.filter((badgeId) =>
			badges.some((badge) => badge.id === badgeId),
		) ?? null;

	if (filteredFavoriteIds?.length === 0) {
		filteredFavoriteIds = null;
	}

	filteredFavoriteIds = isSupporter({ patronTier })
		? filteredFavoriteIds
		: filteredFavoriteIds
			? [filteredFavoriteIds[0]]
			: null;

	// non-supporters can only have one favorite badge, handle losing supporter status
	const sortedBadges = badges.toSorted((a, b) => {
		const aIdx = filteredFavoriteIds?.indexOf(a.id) ?? -1;
		const bIdx = filteredFavoriteIds?.indexOf(b.id) ?? -1;

		if (aIdx !== bIdx) {
			if (aIdx === -1) return 1;
			if (bIdx === -1) return -1;

			return aIdx - bIdx;
		}

		return b.id - a.id;
	}) as T;

	return { badges: sortedBadges, favoriteBadgeIds: filteredFavoriteIds };
}
