import type {
	AbilityPoints,
	AnalyzedBuild,
	AnyWeapon,
	DamageType,
} from "~/features/build-analyzer";
import type { Damage } from "~/features/build-analyzer/analyzer-types";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists";
import { removeDuplicates } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import { roundToNDecimalPlaces } from "~/utils/number";
import {
	DAMAGE_RECEIVERS,
	damagePriorities,
	damageTypesToCombine,
} from "../calculator-constants";
import type { CombineWith, DamageReceiver } from "../calculator-types";
import objectDamages from "./object-dmg.json";
import { objectHitPoints } from "./objectHitPoints";

const getNormalizedMainWeapondId = (id: MainWeaponId) => {
	return id % 10 !== 0 ? ((id - 1) as MainWeaponId) : id;
};

export function damageTypeToMultipliers({
	type,
	weapon,
}: {
	type: DamageType;
	weapon: AnyWeapon;
}) {
	const matchingKeys: Array<keyof typeof objectDamages> = [];

	for (const [key, objectDamagesObj] of Object.entries(objectDamages)) {
		if (
			weapon.type === "MAIN" &&
			(objectDamagesObj.mainWeaponIds as MainWeaponId[]).includes(
				getNormalizedMainWeapondId(weapon.id),
			)
		) {
			matchingKeys.push(key as keyof typeof objectDamages);
		} else if (
			weapon.type === "SUB" &&
			(objectDamagesObj.subWeaponIds as SubWeaponId[]).includes(weapon.id)
		) {
			matchingKeys.push(key as keyof typeof objectDamages);
		} else if (
			weapon.type === "SPECIAL" &&
			(objectDamagesObj.specialWeaponIds as SpecialWeaponId[]).includes(
				weapon.id,
			)
		) {
			matchingKeys.push(key as keyof typeof objectDamages);
		}
	}

	if (matchingKeys.length === 0) return null;

	const relevantKey = resolveRelevantKey({ keys: matchingKeys, type, weapon });

	return objectDamages[relevantKey].rates;
}

function resolveRelevantKey({
	keys,
	type,
	weapon,
}: {
	keys: Array<keyof typeof objectDamages>;
	type: DamageType;
	weapon: AnyWeapon;
}): keyof typeof objectDamages {
	if (keys.length === 1) return keys[0];

	const actualKeys = keys.filter((k) => k !== "Default");
	if (actualKeys.length === 1) return actualKeys[0];

	for (const [weaponType, weaponIds, damageType, key] of damagePriorities) {
		// handle alt kits e.g. Splatteshot might have id 10 but Tentatek Splattershot has id 11
		// but in the context of this function they are one and the same
		const normalizedWeaponId =
			weapon.type === "MAIN"
				? getNormalizedMainWeapondId(weapon.id)
				: weapon.id;

		if (weaponType !== weapon.type) continue;
		if (!weaponIds.includes(normalizedWeaponId)) continue;
		if (damageType !== type) continue;

		// @ts-expect-error TODO: fix this (5.5 version)
		if (!actualKeys.includes(key)) {
			throw new Error(
				`Invalid damagePriorities (no key in object-dmg.json for the weapon): ${JSON.stringify(
					[weaponType, weaponIds, damageType, key],
				)}`,
			);
		}

		return key;
	}

	throw new Error(
		`Could not resolve relevant key from ${actualKeys.join(", ")}; weapon: ${
			weapon.type
		}_${weapon.id}; damage type: ${type} - please update damagePriorities`,
	);
}

export function multipliersToRecordWithFallbacks(
	multipliers: ReturnType<typeof damageTypeToMultipliers>,
) {
	return Object.fromEntries(
		DAMAGE_RECEIVERS.map((receiver) => [
			receiver,
			multipliers?.find((m) => m.target === receiver)?.rate ?? 1,
		]),
	) as Record<DamageReceiver, number>;
}

export function resolveAllUniqueDamageTypes({
	analyzed,
	anyWeapon,
}: {
	analyzed: AnalyzedBuild;
	anyWeapon: AnyWeapon;
}) {
	const damageTypes =
		anyWeapon.type === "SUB"
			? []
			: anyWeapon.type === "SPECIAL"
				? analyzed.stats.specialWeaponDamages.map((d) => d.type)
				: analyzed.stats.damages.map((d) => d.type);

	return removeDuplicates(damageTypes).filter(
		(dmg) => !dmg.includes("SECONDARY"),
	);
}

function resolveFilteredDamages({
	analyzed,
	damageType,
	isMultiShot,
	toCombine,
	anyWeapon,
}: {
	analyzed: AnalyzedBuild;
	damageType: DamageType;
	isMultiShot: boolean;
	toCombine?: CombineWith;
	anyWeapon: AnyWeapon;
}) {
	if (anyWeapon.type === "SUB") {
		return analyzed.stats.subWeaponDefenseDamages.filter(
			(damage) => damage.subWeaponId === anyWeapon.id,
		);
	}

	const damageWithMultishots = (dmg: Damage, multiShots: number) => {
		// initially only Dread Wringer
		const isAsymmetric = analyzed.stats.damages.some(
			(dmg) => dmg.type === "DIRECT_SECONDARY_MIN",
		);

		if (!isAsymmetric) return dmg.value * multiShots;

		const otherKey: DamageType =
			dmg.type === "DIRECT_MAX"
				? "DIRECT_SECONDARY_MAX"
				: "DIRECT_SECONDARY_MIN";

		const secondaryDamage = analyzed.stats.damages.find(
			(dmg) => dmg.type === otherKey,
		);
		invariant(secondaryDamage, "secondary damage not found");

		return dmg.value + secondaryDamage.value;
	};

	const damages =
		anyWeapon.type === "SPECIAL"
			? analyzed.stats.specialWeaponDamages
			: analyzed.stats.damages;

	return damages
		.filter((d) => d.type === damageType || toCombine?.combineWith === d.type)
		.map((damage) => {
			if (!isMultiShot || !damage.multiShots) return damage;

			return {
				...damage,
				value: damageWithMultishots(damage, damage.multiShots),
			};
		});
}

const objectShredderMultipliers = objectDamages.ObjectEffect_Up.rates;
export function calculateDamage({
	analyzed,
	anyWeapon,
	abilityPoints,
	damageType,
	isMultiShot,
}: {
	analyzed: AnalyzedBuild;
	anyWeapon: AnyWeapon;
	abilityPoints: AbilityPoints;
	damageType: DamageType;
	isMultiShot: boolean;
}) {
	const toCombine =
		anyWeapon.type === "MAIN"
			? (damageTypesToCombine[anyWeapon.id] ?? []).find(
					(c) => c.when === damageType,
				)
			: undefined;

	const filteredDamages = resolveFilteredDamages({
		analyzed,
		damageType,
		isMultiShot,
		toCombine,
		anyWeapon,
	});

	const hitPoints = objectHitPoints(abilityPoints);
	const multipliers = Object.fromEntries(
		filteredDamages.map((damage) => {
			return [
				damage.type,
				multipliersToRecordWithFallbacks(
					damageTypeToMultipliers({
						type: damage.type,
						weapon: anyWeapon,
					}),
				),
			];
		}),
	);

	return DAMAGE_RECEIVERS.map((receiver) => {
		const damageReceiverHp = hitPoints[receiver];

		return {
			receiver,
			hitPoints: damageReceiverHp,
			damages: filteredDamages
				.flatMap((damage) => [
					{ ...damage, objectShredder: false },
					{ ...damage, objectShredder: true },
				])
				.flatMap((damage) => {
					if (toCombine?.combineWith === damage.type) {
						return [];
					}

					const otherDamage = () => {
						//[Special Case] Booyah ignores Tri-Stringer's otherDamage at full charge. In-game bug
						if (
							[7010, 7011].includes(anyWeapon.id) &&
							receiver === "NiceBall_Armor"
						) {
							return 0;
						}

						const result = filteredDamages.find(
							(damage) => damage.type === toCombine?.combineWith,
						)?.value;

						invariant(result);

						return result;
					};
					const dmg = () => {
						if (toCombine && !toCombine?.multiplierOnly) {
							return damage.value + otherDamage();
						}
						return damage.value;
					};
					const baseMultiplier = () => {
						const normalMultiplier = multipliers[damage.type][receiver];
						if (toCombine) {
							const actualDamage = () => {
								if (toCombine.multiplierOnly) {
									// undo "baked in" damage (see above)
									return damage.value - otherDamage();
								}

								return damage.value;
							};

							const otherMultiplier =
								multipliers[toCombine.combineWith][receiver];

							// calculate "made up" multiplier that is taking the
							// weighted average of the two multipliers
							return (
								(normalMultiplier * actualDamage() +
									otherMultiplier * otherDamage()) /
								(actualDamage() + otherDamage())
							);
						}
						return normalMultiplier;
					};

					const objectShredderMultiplier =
						objectShredderMultipliers.find((m) => m.target === receiver)
							?.rate ?? 1;
					const multiplier =
						baseMultiplier() *
						(damage.objectShredder ? objectShredderMultiplier : 1);

					const damagePerHit = roundToNDecimalPlaces(dmg() * multiplier);

					const hitsToDestroy = Math.ceil(damageReceiverHp / damagePerHit);

					return {
						value: damagePerHit,
						hitsToDestroy,
						multiplier: roundToNDecimalPlaces(multiplier, 2),
						type: damage.type,
						id: `${damage.id}-${String(damage.objectShredder)}`,
						distance: damage.distance,
						objectShredder: damage.objectShredder,
					};
				}),
		};
	});
}
