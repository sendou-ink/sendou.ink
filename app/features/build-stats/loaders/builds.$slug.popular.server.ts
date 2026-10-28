import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { cachedPublicBuildCounts } from "~/features/builds/core/public-build-counts.server";
import { getServerTFunction } from "~/modules/i18n/i18next.server";
import { weaponIdToType } from "~/modules/in-game-lists/weapon-ids";
import { cache, ttl } from "~/utils/cache.server";
import { notFound, notFoundIfNullish } from "~/utils/remix.server";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { ANY_TIME, DEFAULT_UPDATED_SINCE } from "../build-stats-constants";
import { buildStatsSearchParams } from "../build-stats-search-params";
import { popularBuilds } from "../build-stats-utils";

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const t = getServerTFunction(["weapons"]);
	const weaponId = notFoundIfNullish(weaponNameSlugToId(params.slug));

	if (weaponIdToType(weaponId) === "ALT_SKIN") {
		notFound();
	}

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
		weaponId,
		weaponName: t(`weapons:MAIN_${weaponId}`),
		slug: params.slug!,
		buildsCount: (await cachedPublicBuildCounts()).get(weaponId) ?? 0,
	};
};
