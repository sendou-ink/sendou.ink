import { z } from "zod";
import {
	DAMAGE_TYPE,
	possibleApValues,
} from "~/features/build-analyzer/analyzer-constants";
import type { AnyWeapon } from "~/features/build-analyzer/analyzer-types";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	nonBombSubWeaponIds,
	nonDamagingSpecialWeaponIds,
	specialWeaponIds,
	subWeaponIds,
	weaponCategories,
} from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { SP } from "~/modules/search-params/search-params";

const DEFAULT_ANY_WEAPON: AnyWeapon = {
	type: "MAIN",
	id: weaponCategories[0].weaponIds[0],
};

const anyWeapon = z.codec(z.string(), z.custom<AnyWeapon>(), {
	decode: (value, payload) => {
		const decoded = decodeAnyWeapon(value);
		if (!decoded) {
			payload.issues.push({
				code: "custom",
				message: "Invalid weapon",
				input: value,
			});
			return z.NEVER;
		}
		return decoded;
	},
	encode: (weapon) => `${weapon.type}_${weapon.id}`,
});

export const calculatorSearchParams = SearchParams.define({
	weapon: SP.custom(anyWeapon, { default: DEFAULT_ANY_WEAPON, loader: false }),
	ap: SP.param(
		z
			.number()
			.int()
			.refine((value) => possibleApValues().includes(value)),
		{ default: 0, loader: false },
	),
	dmg: SP.param(z.enum(DAMAGE_TYPE).nullable(), { loader: false }),
	multi: SP.param(z.boolean(), { default: true, loader: false }),
});

function decodeAnyWeapon(value: string): AnyWeapon | null {
	if (value.startsWith("SUB_")) {
		const id = Number(value.replace("SUB_", ""));

		const isDamagingSub = subWeaponIds
			.filter((subId) => !nonBombSubWeaponIds.includes(subId))
			.includes(id as SubWeaponId);
		if (!isDamagingSub) return null;

		return { type: "SUB", id: id as SubWeaponId };
	}

	if (value.startsWith("SPECIAL_")) {
		const id = Number(value.replace("SPECIAL_", ""));

		if (
			!specialWeaponIds.includes(id as SpecialWeaponId) ||
			nonDamagingSpecialWeaponIds.includes(id)
		) {
			return null;
		}

		return { type: "SPECIAL", id: id as SpecialWeaponId };
	}

	if (value.startsWith("MAIN_")) {
		const id = Number(value.replace("MAIN_", ""));

		if (!mainWeaponIds.includes(id as MainWeaponId)) return null;

		return { type: "MAIN", id: id as MainWeaponId };
	}

	// legacy decode fallback: bare numeric main weapon id
	const legacyId = Number(value);
	if (mainWeaponIds.includes(legacyId as MainWeaponId)) {
		return { type: "MAIN", id: legacyId as MainWeaponId };
	}

	return null;
}
