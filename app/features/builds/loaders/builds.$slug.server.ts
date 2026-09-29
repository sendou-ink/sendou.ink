import type { LoaderFunctionArgs } from "react-router";
import { getFixedTForLanguage } from "~/modules/i18n/i18next.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponIdToType } from "~/modules/in-game-lists/weapon-ids";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { mySlugify } from "~/utils/urls";
import * as BuildRepository from "../BuildRepository.server";
import { BUILDS_PAGE_MAX_BUILDS } from "../builds-constants";
import { buildsSearchParams } from "../builds-search-params";
import { filterBuilds } from "../core/filter.server";

export const loader = async ({ params, url }: LoaderFunctionArgs) => {
	const t = await getFixedTForLanguage("en", ["weapons", "common"]);
	const weaponId = weaponNameSlugToId(params.slug);

	if (typeof weaponId !== "number" || weaponIdToType(weaponId) === "ALT_SKIN") {
		throw new Response(null, { status: 404 });
	}

	const { limit, abilities, mode, date } = buildsSearchParams.parse(url);

	const weaponName = t(`weapons:MAIN_${weaponId}`);

	const slug = mySlugify(t(`weapons:MAIN_${weaponId}`, { lng: "en" }));

	const hasActiveFilters =
		abilities.length > 0 || mode !== null || date !== null;

	const builds = await weaponBuilds(
		weaponId,
		hasActiveFilters ? BUILDS_PAGE_MAX_BUILDS : limit + 1,
	).execute();

	const filteredBuilds = hasActiveFilters
		? filterBuilds({
				builds,
				abilities,
				mode,
				date,
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
	};
};

function weaponBuilds(weaponId: MainWeaponId, limit: number) {
	return BuildRepository.builds()
		.forWeapon(weaponId)
		.withAuthor()
		.sortAbilitiesIfPreferred()
		.limit(limit); // xxx: here and other migrate to our common pagination
}
