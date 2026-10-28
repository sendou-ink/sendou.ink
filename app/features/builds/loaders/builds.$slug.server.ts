import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { weaponIdToType } from "~/modules/in-game-lists/weapon-ids";
import { englishWeaponName, weaponSlug } from "~/utils/english-weapon-names";
import { notFound, paginate } from "~/utils/remix.server";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import * as BuildRepository from "../BuildRepository.server";
import { BUILDS_PAGE_SIZE } from "../builds-constants";
import { buildsSearchParams } from "../builds-search-params";
import { cachedPublicBuildCounts } from "../core/public-build-counts.server";

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const user = getUser();
	const weaponId = weaponNameSlugToId(params.slug);

	if (typeof weaponId !== "number" || weaponIdToType(weaponId) === "ALT_SKIN") {
		notFound();
	}

	const { page, ...filters } = buildsSearchParams.parse(url);

	const { builds, ownerCount, buildCount } =
		await BuildRepository.findPageByWeaponId({
			weaponId,
			filters,
			page,
			sortAbilities: !user?.preferences?.disableBuildAbilitySorting,
		});

	return {
		weaponId,
		weaponName: englishWeaponName({ type: "MAIN", id: weaponId }),
		builds,
		filteredBuildsCount: buildCount,
		...paginate({
			url,
			page,
			pageSize: BUILDS_PAGE_SIZE,
			totalCount: ownerCount,
		}),
		slug: weaponSlug({ type: "MAIN", id: weaponId }),
		buildsCount: (await cachedPublicBuildCounts()).get(weaponId) ?? 0,
	};
};
