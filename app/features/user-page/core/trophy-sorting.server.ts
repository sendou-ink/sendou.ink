import { isSupporter } from "~/modules/permissions/utils";

interface SortTrophiesByFavoritesArgs<
	T extends Array<{ id: number; tier?: number | null }>,
> {
	favoriteTrophyIds: number[] | null;
	hiddenTrophyIds: number[] | null;
	trophies: T;
	patronTier: number | null;
}

export function sortTrophiesByFavorites<
	T extends Array<{ id: number; tier?: number | null }>,
>({
	favoriteTrophyIds,
	hiddenTrophyIds,
	trophies,
	patronTier,
}: SortTrophiesByFavoritesArgs<T>): {
	trophies: T;
	favoriteTrophyIds: number[] | null;
} {
	const hiddenSet = new Set(hiddenTrophyIds ?? []);

	let filteredFavoriteIds =
		favoriteTrophyIds?.filter(
			(trophyId) =>
				!hiddenSet.has(trophyId) &&
				trophies.some((trophy) => trophy.id === trophyId),
		) ?? null;

	if (filteredFavoriteIds?.length === 0) {
		filteredFavoriteIds = null;
	}

	filteredFavoriteIds = isSupporter({ patronTier })
		? filteredFavoriteIds
		: null;

	const sortedTrophies = trophies.toSorted((a, b) => {
		const aIdx = filteredFavoriteIds?.indexOf(a.id) ?? -1;
		const bIdx = filteredFavoriteIds?.indexOf(b.id) ?? -1;

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

	return { trophies: sortedTrophies, favoriteTrophyIds: filteredFavoriteIds };
}
