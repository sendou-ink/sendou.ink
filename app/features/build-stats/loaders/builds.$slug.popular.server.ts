import { cachified } from "@epic-web/cachified";
import type { LoaderFunctionArgs } from "react-router";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { cache, IN_MILLISECONDS, ttl } from "~/utils/cache.server";
import { notFoundIfNullLike } from "~/utils/remix.server";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { popularBuilds } from "../build-stats-utils";

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
			return popularBuilds(
				await BuildRepository.popularAbilitiesByWeaponId(weaponId),
			);
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
