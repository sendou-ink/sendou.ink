import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { cache } from "~/utils/cache.server";
import { notFoundIfNullLike } from "~/utils/remix.server";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { abilityPointCountsToAverages } from "../build-stats-utils";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request, ["builds", "weapons"]);
	const weaponId = notFoundIfNullLike(weaponNameSlugToId(params.slug));

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const allAbilities = await cachified({
		key: "all-ability-point-counts",
		cache,
		async getFreshValue() {
			return BuildRepository.abilityPointAverages();
		},
	});

	const cachedStats = await cachified({
		key: `build-stats-${weaponId}`,
		cache,
		async getFreshValue() {
			return abilityPointCountsToAverages({
				allAbilities,
				weaponAbilities: await BuildRepository.abilityPointAverages(weaponId),
			});
		},
	});

	return {
		stats: cachedStats,
		weaponName,
		weaponId,
		meta: {
			slug: params.slug!,
			breadcrumbText: t("builds:linkButton.abilityStats"),
		},
	};
};
