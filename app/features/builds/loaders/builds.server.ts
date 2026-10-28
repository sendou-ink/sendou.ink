import { weaponLandingData } from "~/features/build-analyzer/core/weapon-landing.server";
import { cachedPublicBuildCounts } from "../core/public-build-counts.server";

export const loader = async () => {
	const buildCounts = await cachedPublicBuildCounts();
	const { weapons, weaponPoolIds } = await weaponLandingData();

	return {
		weapons: weapons.map((weapon) => ({
			...weapon,
			buildCount: buildCounts.get(weapon.id) ?? 0,
		})),
		weaponPoolIds,
	};
};
