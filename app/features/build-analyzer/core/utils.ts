import { EMPTY_BUILD } from "~/features/builds/builds-constants";
import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	Ability,
	AbilityType,
	AbilityWithUnknown,
	BuildAbilitiesTupleWithUnknown,
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
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import invariant from "~/utils/invariant";
import type { Unpacked } from "~/utils/types";
import { UNKNOWN_SHORT } from "../analyzer-constants";
import type {
	AbilityPoints,
	AnalyzedBuild,
	AnyWeapon,
	MainWeaponParams,
	ParamsJson,
	SpecialWeaponParams,
	SubWeaponDamage,
	SubWeaponParams,
} from "../analyzer-types";
import { abilityValues as abilityValuesJson } from "./ability-values";
import { weaponParams as rawWeaponParams } from "./weapon-params";

export function weaponParams(): ParamsJson {
	return rawWeaponParams as ParamsJson;
}

export function buildToAbilityPoints(build: BuildAbilitiesTupleWithUnknown) {
	const result: AbilityPoints = new Map();

	for (const abilityRow of build) {
		let abilityDoublerActive = false;
		for (const [i, ability] of abilityRow.entries()) {
			if (ability === "AD") {
				abilityDoublerActive = true;
			}
			if (!isStackableAbility(ability) && ability !== "UNKNOWN") {
				continue;
			}

			const aps = i === 0 ? 10 : 3;
			const apsDoubled = aps * (abilityDoublerActive ? 2 : 1);
			const newAp = (result.get(ability) ?? 0) + apsDoubled;

			result.set(ability, newAp);
		}
	}

	return result;
}

export function isStackableAbility(
	ability: AbilityWithUnknown,
): ability is Ability {
	if (ability === "UNKNOWN") return false;
	const abilityObj = abilities.find((a) => a.name === ability);
	invariant(abilityObj);

	return abilityObj.type === "STACKABLE";
}

export function isMainOnlyAbility(
	ability: AbilityWithUnknown,
): ability is Ability {
	if (ability === "UNKNOWN") return false;

	return !isStackableAbility(ability);
}

export function apFromMap({
	abilityPoints,
	ability,
}: {
	abilityPoints: AbilityPoints;
	ability: Ability;
}) {
	return abilityPoints.get(ability) ?? 0;
}

export function abilityValues({
	key,
	weapon,
}: {
	key: keyof typeof abilityValuesJson;
	weapon: MainWeaponParams | SubWeaponParams | SpecialWeaponParams;
}): [number, number, number] {
	const overwrites = weapon.overwrites?.[key];

	const [High, Mid, Low] = abilityValuesJson[key];
	invariant(typeof High === "number");
	invariant(typeof Mid === "number");
	invariant(typeof Low === "number");

	return [
		overwrites?.High ?? High,
		overwrites?.Mid ?? Mid,
		overwrites?.Low ?? Low,
	];
}

function calculateAbilityPointToPercent(ap: number) {
	return Math.min(3.3 * ap - 0.027 * ap ** 2, 100);
}

function getSlope(high: number, mid: number, low: number) {
	if (mid === low) {
		return 0;
	}
	return (mid - low) / (high - low);
}

function lerpN(p: number, s: number) {
	if (s.toFixed(3) === "0.500") {
		return p;
	}
	if (p === 0.0) {
		return p;
	}
	if (p === 1.0) {
		return p;
	}

	return Math.E ** (-1 * ((Math.log(p) * Math.log(s)) / Math.log(2)));
}

function abilityPointsToEffect({
	key,
	abilityPoints,
	weapon,
}: {
	key: keyof typeof abilityValuesJson;
	abilityPoints: number;
	weapon: MainWeaponParams | SubWeaponParams | SpecialWeaponParams;
}) {
	const [high, mid, low] = abilityValues({ key, weapon });

	const slope = getSlope(high, mid, low);
	const percentage = calculateAbilityPointToPercent(abilityPoints) / 100.0;
	const result = low + (high - low) * lerpN(slope, percentage);

	return result;
}

export function abilityPointsToEffects({
	key,
	abilityPoints,
	weapon,
}: {
	key: keyof typeof abilityValuesJson;
	abilityPoints: number;
	weapon: MainWeaponParams | SubWeaponParams | SpecialWeaponParams;
}) {
	return {
		baseEffect: abilityPointsToEffect({ key, abilityPoints: 0, weapon }),
		effect: abilityPointsToEffect({ key, abilityPoints, weapon }),
	};
}

export function hasEffect({
	key,
	weapon,
}: {
	key: keyof typeof abilityValuesJson;
	weapon: MainWeaponParams | SubWeaponParams | SpecialWeaponParams;
}) {
	const [high, mid, low] = abilityValues({ key, weapon });

	return high !== mid || mid !== low;
}

const DEFAULT_ANY_WEAPON = {
	type: "MAIN",
	id: weaponCategories[0].weaponIds[0],
} as const;
export function validatedAnyWeaponFromSearchParams(
	searchParams: URLSearchParams,
): AnyWeapon {
	const rawWeapon = searchParams.get("weapon");
	if (!rawWeapon) return DEFAULT_ANY_WEAPON;

	if (rawWeapon?.startsWith("SUB_")) {
		const id = Number(rawWeapon.replace("SUB_", ""));

		if (
			!subWeaponIds
				.filter((id) => !nonBombSubWeaponIds.includes(id))
				.includes(id as any)
		) {
			return DEFAULT_ANY_WEAPON;
		}

		return { type: "SUB", id: id as SubWeaponId };
	}

	if (rawWeapon?.startsWith("SPECIAL_")) {
		const id = Number(rawWeapon.replace("SPECIAL_", ""));

		if (
			!specialWeaponIds
				.filter((id) => !nonDamagingSpecialWeaponIds.includes(id))
				.includes(id as any)
		) {
			return DEFAULT_ANY_WEAPON;
		}

		return { type: "SPECIAL", id: id as SpecialWeaponId };
	}

	if (rawWeapon?.startsWith("MAIN_")) {
		const id = Number(rawWeapon.replace("MAIN_", ""));

		if (!mainWeaponIds.includes(id as any)) {
			return DEFAULT_ANY_WEAPON;
		}

		return { type: "MAIN", id: id as MainWeaponId };
	}

	return {
		type: "MAIN",
		id: validatedWeaponIdFromSearchParams(searchParams) ?? 0,
	};
}

export function validatedWeaponIdFromSearchParams(
	searchParams: URLSearchParams,
) {
	const weaponId = searchParams.get("weapon")
		? Number(searchParams.get("weapon"))
		: null;

	if (mainWeaponIds.includes(weaponId as any)) {
		return weaponId as MainWeaponId;
	}

	return null;
}

function validateAbility(
	legalTypes: Array<AbilityType>,
	ability?: string,
): AbilityWithUnknown {
	if (!ability) throw new Error("Ability missing");
	if (ability === UNKNOWN_SHORT) return "UNKNOWN";

	const abilityObj = abilities.find(
		(a) => a.name === ability && legalTypes.includes(a.type),
	);
	if (abilityObj) return abilityObj.name;

	throw new Error("Invalid ability");
}

export function validatedBuildFromSearchParams(
	searchParams: URLSearchParams,
	key = "build",
	otherBuild?: BuildAbilitiesTupleWithUnknown,
): BuildAbilitiesTupleWithUnknown {
	const abilitiesArr = searchParams.get(key)
		? searchParams.get(key)?.split(",")
		: null;

	if (!abilitiesArr) return EMPTY_BUILD;
	if (otherBuild && buildIsEmpty(otherBuild)) return EMPTY_BUILD;

	try {
		return [
			[
				validateAbility(["STACKABLE", "HEAD_MAIN_ONLY"], abilitiesArr[0]),
				validateAbility(["STACKABLE"], abilitiesArr[1]),
				validateAbility(["STACKABLE"], abilitiesArr[2]),
				validateAbility(["STACKABLE"], abilitiesArr[3]),
			],
			[
				validateAbility(["STACKABLE", "CLOTHES_MAIN_ONLY"], abilitiesArr[4]),
				validateAbility(["STACKABLE"], abilitiesArr[5]),
				validateAbility(["STACKABLE"], abilitiesArr[6]),
				validateAbility(["STACKABLE"], abilitiesArr[7]),
			],
			[
				validateAbility(["STACKABLE", "SHOES_MAIN_ONLY"], abilitiesArr[8]),
				validateAbility(["STACKABLE"], abilitiesArr[9]),
				validateAbility(["STACKABLE"], abilitiesArr[10]),
				validateAbility(["STACKABLE"], abilitiesArr[11]),
			],
		];
	} catch {
		return EMPTY_BUILD;
	}
}

export function serializeBuild(build: BuildAbilitiesTupleWithUnknown) {
	return build
		.flat()
		.map((ability) => (ability === "UNKNOWN" ? UNKNOWN_SHORT : ability))
		.join(",");
}

export const hpDivided = (hp: number) => hp / 10;

export function possibleApValues() {
	const uniqueValues = new Set<number>();

	for (let i = 0; i < 4; i++) {
		for (let j = 0; j < 10; j++) {
			uniqueValues.add(i * 10 + j * 3);
		}
	}

	return Array.from(uniqueValues).sort((a, b) => a - b);
}

export const buildIsEmpty = (build: BuildAbilitiesTupleWithUnknown) =>
	build.flat().every((ability) => ability === "UNKNOWN");

export function damageIsSubWeaponDamage(
	damage:
		| Unpacked<AnalyzedBuild["stats"]["damages"]>
		| Unpacked<AnalyzedBuild["stats"]["subWeaponDefenseDamages"]>,
): damage is Unpacked<AnalyzedBuild["stats"]["subWeaponDefenseDamages"]> {
	return typeof (damage as SubWeaponDamage).subWeaponId === "number";
}

const rawMultiShot: Partial<Record<MainWeaponId, number>> = {
	// L-3
	300: 3,
	// H-3
	310: 3,
	// Tri-Stringer,
	7010: 3,
	// REEF-LUX,
	7020: 3,
	// Wellstring V,
	7030: 5,
	// Bloblobber
	3030: 4,
	// Dread Winger
	3050: 2,
};

/**
 * Returns the multi-shot count for a given weapon ID. Multi-shot refers to the number of projectiles fired in a single shot,
 * e.g. H-3 Nozzlenose fires 3 projectiles per one trigger press.
 *
 * @returns The multi-shot count associated with the weapon, or `undefined` if not found.
 */
export const weaponIdToMultiShotCount = (weaponId: MainWeaponId) => {
	return rawMultiShot[
		weaponIdToBaseWeaponId(weaponId) as keyof typeof rawMultiShot
	];
};
