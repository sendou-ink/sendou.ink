import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { notFoundIfNullLike } from "~/utils/remix.server";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { abilityPointCountsToAverages } from "../build-stats-utils";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request, ["builds", "weapons"]);
	const weaponId = notFoundIfNullLike(weaponNameSlugToId(params.slug));

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const cachedStats = await cachified({
		key: `build-stats-${weaponId}`,
		cache,
		ttl: ttl(IN_MILLISECONDS.ONE_HOUR),
		async getFreshValue() {
			return abilityPointCountsToAverages({
				allAbilities: await BuildRepository.abilityPointAverages(),
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
