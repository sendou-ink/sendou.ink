import { isSupporter } from "~/modules/permissions/utils";

interface SortTrophiesByFavoritesArgs<
	T extends Array<{ id: number; tier?: number | null }>,
> {
	favoriteTrophyIds: number[] | null;
	trophies: T;
	patronTier: number | null;
}

/**
 * Favorite trophies first, in the order the user picked them (supporters only), the rest by tier
 * and then descending id. Favorites no longer owned are ignored.
 */
export function sortTrophiesByFavorites<
	T extends Array<{ id: number; tier?: number | null }>,
>({
	favoriteTrophyIds,
	trophies,
	patronTier,
}: SortTrophiesByFavoritesArgs<T>): T {
	const effectiveFavoriteIds = isSupporter({ patronTier })
		? (favoriteTrophyIds ?? []).filter((trophyId) =>
				trophies.some((trophy) => trophy.id === trophyId),
			)
		: [];

	return trophies.toSorted((a, b) => {
		const aIdx = effectiveFavoriteIds.indexOf(a.id);
		const bIdx = effectiveFavoriteIds.indexOf(b.id);

		if (aIdx !== bIdx) {
			if (aIdx === -1) return 1;
			if (bIdx === -1) return -1;

			return aIdx - bIdx;
		}

		const aTier = a.tier ?? Number.MAX_SAFE_INTEGER;
		const bTier = b.tier ?? Number.MAX_SAFE_INTEGER;
		if (aTier !== bTier) return aTier - bTier;

		return b.id - a.id;
	}) as T;
}
