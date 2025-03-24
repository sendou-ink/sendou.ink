import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { ONE_HOUR_IN_MS } from "~/constants";
import { i18next } from "~/modules/i18n/i18next.server";
import { cache, ttl } from "~/utils/cache.server";
import { notFoundIfNullLike } from "~/utils/remix.server";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { abilityPointCountsToAverages } from "../build-stats-utils";
import { averageAbilityPoints } from "../queries/averageAbilityPoints.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request, ["builds", "weapons"]);
	const weaponId = notFoundIfNullLike(weaponNameSlugToId(params.slug));

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const cachedStats = await cachified({
		key: `build-stats-${weaponId}`,
		cache,
		ttl: ttl(ONE_HOUR_IN_MS),
		async getFreshValue() {
			return abilityPointCountsToAverages({
				allAbilities: averageAbilityPoints(),
				weaponAbilities: averageAbilityPoints(weaponId),
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
