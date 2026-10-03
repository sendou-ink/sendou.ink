import cachified from "@epic-web/cachified";
import { weaponLandingData } from "~/features/build-analyzer/core/weapon-landing.server";
import { cache, ttl } from "~/utils/cache.server";
import * as BuildRepository from "../BuildRepository.server";

export const loader = async () => {
	const buildCounts = await cachified({
		key: "builds-index-build-counts",
		cache,
		ttl: ttl(Number.POSITIVE_INFINITY),
		getFreshValue: BuildRepository.countAllPublicByWeaponId,
	});
	const { weapons, weaponPoolIds } = await weaponLandingData();

	return {
		weapons: weapons.map((weapon) => ({
			...weapon,
			buildCount: buildCounts.get(weapon.id) ?? 0,
		})),
		weaponPoolIds,
	};
};
