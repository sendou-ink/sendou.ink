import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { i18next } from "~/modules/i18n/i18next.server";
import { IN_MILLISECONDS, cache, ttl } from "~/utils/cache.server";
import { notFoundIfNullLike } from "~/utils/remix.server";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { popularBuilds } from "../build-stats-utils";
import { abilitiesByWeaponId } from "../queries/abilitiesByWeaponId.server";

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const t = await i18next.getFixedT(request, ["builds", "weapons"]);
	const slug = params.slug;
	const weaponId = notFoundIfNullLike(weaponNameSlugToId(slug));

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const cachedPopularBuilds = await cachified({
		key: `popular-builds-${weaponId}`,
		cache,
		ttl: ttl(IN_MILLISECONDS.ONE_HOUR),
		async getFreshValue() {
			return popularBuilds(abilitiesByWeaponId(weaponId));
		},
	});

	return {
		popularBuilds: cachedPopularBuilds,
		weaponName,
		meta: {
			weaponId,
			slug: slug!,
			breadcrumbText: t("builds:linkButton.popularBuilds"),
		},
	};
};
