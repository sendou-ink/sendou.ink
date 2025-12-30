import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { weaponIdToType } from "~/modules/in-game-lists/weapon-ids";
import { logger } from "~/utils/logger";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { mySlugify } from "~/utils/urls";
import * as BuildRepository from "../BuildRepository.server";
import {
	BUILDS_PAGE_BATCH_SIZE,
	BUILDS_PAGE_MAX_BUILDS,
	FILTER_SEARCH_PARAM_KEY,
} from "../builds-constants";
import { buildFiltersSearchParams } from "../builds-schemas.server";
import { filterBuilds } from "../core/filter.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const t = await i18next.getFixedT(request, ["weapons", "common"], {
		lng: "en",
	});
	const weaponId = weaponNameSlugToId(params.slug);

	if (typeof weaponId !== "number" || weaponIdToType(weaponId) === "ALT_SKIN") {
		throw new Response(null, { status: 404 });
	}

	const url = new URL(request.url);
	const limit = Math.min(
		Number(url.searchParams.get("limit") ?? BUILDS_PAGE_BATCH_SIZE),
		BUILDS_PAGE_MAX_BUILDS,
	);

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const slug = mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));

	const rawFilters = url.searchParams.get(FILTER_SEARCH_PARAM_KEY);
	const filters = buildFiltersSearchParams.safeParse(rawFilters ?? "[]");
	const hasActiveFilters =
		filters.success && filters.data && filters.data.length > 0;

	const builds = await BuildRepository.allByWeaponId(weaponId, {
		limit: hasActiveFilters ? BUILDS_PAGE_MAX_BUILDS : limit + 1,
		sortAbilities: !user?.preferences?.disableBuildAbilitySorting,
	});

	if (!filters.success) {
		logger.error(
			"Invalid filters",
			JSON.stringify(filters.error.issues, null, 2),
		);
	}

	const filteredBuilds = hasActiveFilters
		? filterBuilds({
				builds,
				filters: filters.data!,
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
		filters: filters.success ? filters.data : [],
	};
};
