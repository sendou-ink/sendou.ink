import * as v from "valibot";
import { weaponLandingSearchParams } from "~/components/weapon-landing-search-params";
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
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as SearchParams from "~/modules/search-params/search-params";
import { codec, SP } from "~/modules/search-params/search-params";
import {
	DAMAGING_SPECIAL_WEAPON_IDS,
	DAMAGING_SUB_WEAPON_IDS,
} from "./calculator-constants";

const anyWeapon = codec(
	v.custom<AnyWeapon>(() => true),
	{
		decode: (value) => {
			const decoded = decodeAnyWeapon(value);
			if (!decoded) {
				return undefined;
			}
			return decoded;
		},
		encode: (weapon) => `${weapon.type}_${weapon.id}`,
	},
);

export const calculatorSearchParams = SearchParams.define({
	weapon: SP.custom(SearchParams.nullableCodec(anyWeapon), {
		default: null,
		loader: false,
	}),
	category: weaponLandingSearchParams.shape.category,
	ap: SP.param(
		v.pipe(
			v.number(),
			v.integer(),
			v.check((value) => possibleApValues().includes(value)),
		),
		{ default: 0, loader: false },
	),
	dmg: SP.param(v.nullable(v.picklist(DAMAGE_TYPE)), { loader: false }),
	multi: SP.param(v.boolean(), { default: true, loader: false }),
});

function decodeAnyWeapon(value: string): AnyWeapon | null {
	if (value.startsWith("SUB_")) {
		const id = Number(value.replace("SUB_", ""));

		if (!DAMAGING_SUB_WEAPON_IDS.includes(id as SubWeaponId)) return null;

		return { type: "SUB", id: id as SubWeaponId };
	}

	if (value.startsWith("SPECIAL_")) {
		const id = Number(value.replace("SPECIAL_", ""));

		if (!DAMAGING_SPECIAL_WEAPON_IDS.includes(id as SpecialWeaponId)) {
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
	if (/^\d+$/.test(value) && mainWeaponIds.includes(legacyId as MainWeaponId)) {
		return { type: "MAIN", id: legacyId as MainWeaponId };
	}

	return null;
}
