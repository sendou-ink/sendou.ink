import { getServerTFunction } from "~/modules/i18n/i18next.server";
import { weaponIdToType } from "~/modules/in-game-lists/weapon-ids";
import { weaponSlug } from "~/utils/english-weapon-names";
import { notFound, notFoundIfNullish } from "~/utils/remix.server";
import { weaponNameSlugToId } from "~/utils/unslugify.server";
import { cachedPublicBuildCounts } from "./public-build-counts.server";

/** Data every tab of a weapon's builds page (builds, stats, popular) needs for its shared layout. Throws a 404 for an unknown slug or an alt skin. */
export async function weaponBuildsLayoutData(slugParam: string | undefined) {
	const weaponId = notFoundIfNullish(weaponNameSlugToId(slugParam));
	if (weaponIdToType(weaponId) === "ALT_SKIN") notFound();

	const t = getServerTFunction(["weapons"]);

	return {
		weaponId,
		weaponName: t(`weapons:MAIN_${weaponId}`),
		slug: weaponSlug({ type: "MAIN", id: weaponId }),
		buildsCount: (await cachedPublicBuildCounts()).get(weaponId) ?? 0,
	};
}
