import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { weaponBuildsLayoutData } from "~/features/builds/core/weapon-builds-layout.server";
import {
	weaponCategories,
	weaponIdToCategory,
} from "~/modules/in-game-lists/weapon-ids";
import { cache, ttl } from "~/utils/cache.server";
import { invariant } from "~/utils/invariant";
import { ANY_TIME, DEFAULT_UPDATED_SINCE } from "../build-stats-constants";
import { buildStatsSearchParams } from "../build-stats-search-params";
import { abilityStats } from "../build-stats-utils";

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const layout = await weaponBuildsLayoutData(params.slug);
	const { weaponId } = layout;

	const category = weaponIdToCategory(weaponId);
	const { date: selectedDate } = buildStatsSearchParams.parse(url);

	const statsSince = async (date: string) => {
		const updatedSince = date === ANY_TIME ? null : date;

		const allAbilityPointSums = await cachified({
			key: `all-ability-point-sums-${date}`,
			cache,
			ttl: ttl(Number.POSITIVE_INFINITY),
			getFreshValue: () =>
				BuildRepository.findAllAbilityPointSums(updatedSince),
		});

		const weaponAbilityPointCounts = await cachified({
			key: `ability-point-counts-${category}-${date}`,
			cache,
			ttl: ttl(Number.POSITIVE_INFINITY),
			getFreshValue: () => {
				const categoryWeaponIds = weaponCategories.find(
					(weaponCategory) => weaponCategory.name === category,
				)?.weaponIds;
				invariant(categoryWeaponIds, `No weapons for category ${category}`);

				return BuildRepository.findAbilityPointCountsByWeaponIds({
					weaponIds: [...categoryWeaponIds],
					updatedSince,
				});
			},
		});

		return abilityStats({
			weaponId,
			allAbilityPointSums,
			weaponAbilityPointCounts,
		});
	};

	let resolvedDate = selectedDate ?? DEFAULT_UPDATED_SINCE;
	let stats = await statsSince(resolvedDate);
	if (!selectedDate && stats.weaponBuildsCount === 0) {
		resolvedDate = ANY_TIME;
		stats = await statsSince(resolvedDate);
	}

	return {
		stats,
		date: resolvedDate,
		...layout,
		weaponCategory: category,
	};
};
