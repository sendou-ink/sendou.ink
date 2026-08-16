import type {
	Ability,
	BuildAbilitiesTupleWithUnknown,
	MainWeaponId,
	SpecialWeaponId,
} from "~/modules/in-game-lists/types";
import { weaponIdToBaseWeaponId } from "~/modules/in-game-lists/weapon-ids";
import invariant from "~/utils/invariant";
import type { Unpacked } from "~/utils/types";
import type {
	AbilityPoints,
	AnalyzedBuild,
	MainWeaponParams,
	ParamsJson,
	SpecialWeaponParams,
	SubWeaponDamage,
	SubWeaponParams,
} from "../analyzer-types";
import { abilityValues as abilityValuesJson } from "../data/ability-values";
import { weaponParams as rawWeaponParams } from "../data/weapon-params";

export function weaponParams(): ParamsJson {
	return rawWeaponParams as unknown as ParamsJson;
}

export function mainWeaponParams(weaponId: MainWeaponId): MainWeaponParams {
	const params = rawWeaponParams as unknown as ParamsJson;
	const baseId = weaponIdToBaseWeaponId(weaponId);
	const baseStats = params.baseWeaponStats[baseId];
	const kit = params.weaponKits[weaponId];

	return { ...baseStats, ...kit } as MainWeaponParams;
}

export function specialWeaponParams(
	specialWeaponId: SpecialWeaponId,
): SpecialWeaponParams {
	const params = rawWeaponParams as unknown as ParamsJson;

	return params.specialWeapons[specialWeaponId] as SpecialWeaponParams;
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

export const hpDivided = (hp: number) => hp / 10;

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
