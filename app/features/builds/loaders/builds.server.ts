import cachified from "@epic-web/cachified";
import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import {
	canonicalWeaponSplId,
	mainWeaponIds,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { cache, ttl } from "~/utils/cache.server";
import * as BuildRepository from "../BuildRepository.server";

export const loader = async () => {
	const user = getUser();

	const buildCounts = await cachified({
		key: "builds-index-build-counts",
		cache,
		ttl: ttl(Number.POSITIVE_INFINITY),
		getFreshValue: BuildRepository.countAllPublicByWeaponId,
	});
	const weaponPool = user
		? await MatchProfileRepository.findWeaponPoolByUserId(user.id)
		: [];

	const weapons = mainWeaponIds
		.filter((weaponId) => weaponIdToType(weaponId) !== "ALT_SKIN")
		.map((weaponId) => {
			const { subWeaponId, specialWeaponId } = mainWeaponParams(weaponId);

			return {
				id: weaponId,
				buildCount: buildCounts.get(weaponId) ?? 0,
				subWeaponId,
				specialWeaponId,
			};
		});

	return {
		weapons,
		weaponPoolIds: R.unique(
			weaponPool.map((weapon) => canonicalWeaponSplId(weapon.weaponSplId)),
		),
	};
};
