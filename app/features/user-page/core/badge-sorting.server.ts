import { isSupporter } from "~/modules/permissions/utils";

interface SortBadgesByFavoritesArgs<T extends { id: number }[]> {
	favoriteBadgeIds: number[];
	badges: T;
	patronTier: number | null;
}

/**
 * Favorite badges first, in the order the user picked them, the rest by descending id.
 * Favorites no longer owned are ignored and non-supporters get only one, handling lapsed
 * supporter status.
 */
export function sortBadgesByFavorites<T extends { id: number }[]>({
	favoriteBadgeIds,
	badges,
	patronTier,
}: SortBadgesByFavoritesArgs<T>): T {
	const ownedFavoriteIds = favoriteBadgeIds.filter((badgeId) =>
		badges.some((badge) => badge.id === badgeId),
	);

	const effectiveFavoriteIds = isSupporter({ patronTier })
		? ownedFavoriteIds
		: ownedFavoriteIds.slice(0, 1);

	return badges.toSorted((a, b) => {
		const aIdx = effectiveFavoriteIds.indexOf(a.id);
		const bIdx = effectiveFavoriteIds.indexOf(b.id);

		if (aIdx !== bIdx) {
			if (aIdx === -1) return 1;
			if (bIdx === -1) return -1;

			return aIdx - bIdx;
		}

		return b.id - a.id;
	}) as T;
}
