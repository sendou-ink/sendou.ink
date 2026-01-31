import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import { i18next } from "~/modules/i18n/i18next.server";
import { weaponIdToType } from "~/modules/in-game-lists/weapon-ids";
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
	const user = getUser();
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

	const filters = resolveFilters(url.searchParams.get(FILTER_SEARCH_PARAM_KEY));

	const builds = await BuildRepository.allByWeaponId(weaponId, {
		limit: filters ? BUILDS_PAGE_MAX_BUILDS : limit + 1,
		sortAbilities: !user?.preferences?.disableBuildAbilitySorting,
	});

	const filteredBuilds = filters
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
		filters: filters ?? [],
	};
};

function resolveFilters(rawFilters: string | null) {
	if (!rawFilters) return null;

	const filters = buildFiltersSearchParams.safeParse(rawFilters);
	const hasActiveFilters =
		filters.success && filters.data && filters.data.length > 0;

	if (!hasActiveFilters) return null;

	return filters.data;
}
