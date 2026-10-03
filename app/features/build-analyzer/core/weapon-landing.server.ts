import * as R from "remeda";
import { getUser } from "~/features/auth/core/user.server";
import * as MatchProfileRepository from "~/features/match-profile/MatchProfileRepository.server";
import {
	canonicalWeaponSplId,
	mainWeaponIds,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import { mainWeaponParams } from "./utils";

/** Loader data for `<WeaponLanding />`: every weapon (alt skins excluded) with its kit, plus the logged in user's weapon pool. */
export async function weaponLandingData() {
	const user = getUser();

	const weaponPool = user
		? await MatchProfileRepository.findWeaponPoolByUserId(user.id)
		: [];

	const weapons = mainWeaponIds
		.filter((weaponId) => weaponIdToType(weaponId) !== "ALT_SKIN")
		.map((weaponId) => {
			const { subWeaponId, specialWeaponId } = mainWeaponParams(weaponId);

			return { id: weaponId, subWeaponId, specialWeaponId };
		});

	return {
		weapons,
		weaponPoolIds: R.unique(
			weaponPool.map((weapon) => canonicalWeaponSplId(weapon.weaponSplId)),
		),
	};
}
