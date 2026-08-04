import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { getFixedTForLanguage } from "~/modules/i18n/i18next.server";
import { weaponIdToType } from "~/modules/in-game-lists/weapon-ids";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { mySlugify } from "~/utils/urls";
import * as BuildRepository from "../BuildRepository.server";
import { BUILDS_PAGE_MAX_BUILDS } from "../builds-constants";
import { buildsSearchParams } from "../builds-search-params";
import { filterBuilds } from "../core/filter.server";

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const user = getUser();
	const t = await getFixedTForLanguage("en", ["weapons", "common"]);
	const weaponId = weaponNameSlugToId(params.slug);

	if (typeof weaponId !== "number" || weaponIdToType(weaponId) === "ALT_SKIN") {
		throw new Response(null, { status: 404 });
	}

	const { limit, f: filters } = buildsSearchParams.parse(url);

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const slug = mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));

	const hasActiveFilters = filters.length > 0;

	const builds = await BuildRepository.findAllByWeaponId(weaponId, {
		limit: hasActiveFilters ? BUILDS_PAGE_MAX_BUILDS : limit + 1,
		sortAbilities: !user?.preferences?.disableBuildAbilitySorting,
	});

	const filteredBuilds = hasActiveFilters
		? filterBuilds({
				builds,
				filters,
				count: limit + 1,
			})
		: builds;

	let hasMoreBuilds = false;
	if (filteredBuilds.length > limit) {
		filteredBuilds.pop();

		if (limit < BUILDS_PAGE_MAX_BUILDS) {
			hasMoreBuilds = true;
		}
	}

	return {
		weaponId,
		weaponName,
		builds: filteredBuilds,
		limit,
		hasMoreBuilds,
		slug,
		filters,
	};
};
