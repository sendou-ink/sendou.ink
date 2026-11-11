import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { weaponBuildsLayoutData } from "~/features/builds/core/weapon-builds-layout.server";
import { cache, ttl } from "~/utils/cache.server";
import { ANY_TIME, DEFAULT_UPDATED_SINCE } from "../build-stats-constants";
import { buildStatsSearchParams } from "../build-stats-search-params";
import { popularBuilds } from "../build-stats-utils";

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const layout = await weaponBuildsLayoutData(params.slug);
	const { weaponId } = layout;

	const { date: selectedDate } = buildStatsSearchParams.parse(url);

	const popularSince = (date: string) =>
		cachified({
			key: `popular-builds-${weaponId}-${date}`,
			cache,
			ttl: ttl(Number.POSITIVE_INFINITY),
			async getFreshValue() {
				return popularBuilds(
					await BuildRepository.findNewestBuildPerOwnerByWeaponId({
						weaponId,
						updatedSince: date === ANY_TIME ? null : date,
					}),
				);
			},
		});

	let resolvedDate = selectedDate ?? DEFAULT_UPDATED_SINCE;
	let popular = await popularSince(resolvedDate);
	if (!selectedDate && popular.builds.length === 0) {
		resolvedDate = ANY_TIME;
		popular = await popularSince(resolvedDate);
	}

	return {
		popular,
		date: resolvedDate,
		...layout,
	};
};
