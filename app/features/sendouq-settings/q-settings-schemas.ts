import { z } from "zod";
import { stringConstant, weaponPool } from "~/form/fields";
import { SENDOUQ_WEAPON_POOL_MAX_SIZE } from "./q-settings-constants";

export const updateWeaponPoolSchema = z.object({
	_action: stringConstant("UPDATE_SENDOUQ_WEAPON_POOL"),
	weaponPool: weaponPool({
		label: "labels.weaponPool",
		maxCount: SENDOUQ_WEAPON_POOL_MAX_SIZE,
	}),
});
