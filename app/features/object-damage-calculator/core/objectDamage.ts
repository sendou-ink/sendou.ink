import * as R from "remeda";
import type {
	AbilityPoints,
	AnalyzedBuild,
	AnyWeapon,
	Damage,
	DamageType,
} from "~/features/build-analyzer/analyzer-types";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import { weaponIdToBaseWeaponId } from "~/modules/in-game-lists/weapon-ids";
import { invariant } from "~/utils/invariant";
import {
	COMBINED_DAMAGE_TYPE,
	combinedDamages,
	DAMAGE_RECEIVERS,
	damagePriorities,
	damageTypesToCombine,
} from "../calculator-constants";
import type {
	CalculatorDamageType,
	CombinedDamage,
	CombineWith,
	DamageReceiver,
} from "../calculator-types";
import objectDamages from "../data/object-dmg.json";
import { objectHitPoints } from "./objectHitPoints";

function damageTypeToMultipliers({
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
				weaponIdToBaseWeaponId(weapon.id),
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

	for (const [weaponType, weaponIds, damageType, key] of damagePriorities) {
		// alt kits (e.g. Tentatek Splattershot) share their base kit's damage
		const normalizedWeaponId =
			weapon.type === "MAIN" ? weaponIdToBaseWeaponId(weapon.id) : weapon.id;

		if (weaponType !== weapon.type) continue;
		if (!weaponIds.includes(normalizedWeaponId)) continue;
		if (damageType !== type) continue;

		if (!keys.includes(key)) {
			throw new Error(
				`Invalid damagePriorities (no key in object-dmg.json for the weapon): ${JSON.stringify(
					[weaponType, weaponIds, damageType, key],
				)}`,
			);
		}

		return key;
	}

	const actualKeys = keys.filter((k) => k !== "Default");
	if (actualKeys.length === 1) return actualKeys[0];

	throw new Error(
		`Could not resolve relevant key from ${actualKeys.join(", ")}; weapon: ${
			weapon.type
		}_${weapon.id}; damage type: ${type} - please update damagePriorities`,
	);
}

function multipliersToRecordWithFallbacks(
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
}): Array<CalculatorDamageType> {
	const damageTypes =
		anyWeapon.type === "SUB"
			? []
			: anyWeapon.type === "SPECIAL"
				? analyzed.stats.specialWeaponDamages.map((d) => d.type)
				: analyzed.stats.damages.map((d) => d.type);

	const result = R.unique(damageTypes).filter(
		(dmg) =>
			!dmg.startsWith("DIRECT_SECONDARY") &&
			dmg !== "COMBO" &&
			dmg !== "DISTANCE_JUMP",
	);

	return resolveCombinedDamage(anyWeapon)
		? [COMBINED_DAMAGE_TYPE, ...result]
		: result;
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
			(candidate) => candidate.type === "DIRECT_SECONDARY_MIN",
		);

		if (!isAsymmetric) return dmg.value * multiShots;

		const otherKey: DamageType =
			dmg.type === "DIRECT_MAX"
				? "DIRECT_SECONDARY_MAX"
				: "DIRECT_SECONDARY_MIN";

		const secondaryDamage = analyzed.stats.damages.find(
			(candidate) => candidate.type === otherKey,
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
	damageType: CalculatorDamageType;
	isMultiShot: boolean;
}): Array<ReceiverDamages> {
	if (damageType === COMBINED_DAMAGE_TYPE) {
		const combined = resolveCombinedDamage(anyWeapon);
		invariant(combined, "Weapon has no combined damage");

		return calculateCombinedDamage({
			analyzed,
			anyWeapon,
			abilityPoints,
			combined,
			isMultiShot,
		});
	}

	const toCombine =
		anyWeapon.type === "MAIN"
			? (damageTypesToCombine[weaponIdToBaseWeaponId(anyWeapon.id)] ?? []).find(
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
						const result = filteredDamages.find(
							(candidate) => candidate.type === toCombine?.combineWith,
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

							// "made up" multiplier: weighted average of the two
							return (
								(normalMultiplier * actualDamage() +
									otherMultiplier * otherDamage()) /
								(actualDamage() + otherDamage())
							);
						}
						return normalMultiplier;
					};

					const multiplier =
						baseMultiplier() *
						(damage.objectShredder ? objectShredderMultiplier(receiver) : 1);

					const damagePerHit = R.round(dmg() * multiplier, 2);

					return {
						value: damagePerHit,
						hitsToDestroy: Math.ceil(damageReceiverHp / damagePerHit),
						multipliers: [R.round(multiplier, 2)],
						type: damage.type,
						id: `${damage.id}-${String(damage.objectShredder)}`,
						distance: damage.distance,
						objectShredder: damage.objectShredder,
					};
				}),
		};
	});
}

/** The direct hit + explosion pair the weapon offers as the "Combined" damage type, or `null` if it has none. */
export function resolveCombinedDamage(anyWeapon: AnyWeapon) {
	if (anyWeapon.type !== "MAIN") return null;

	return combinedDamages[weaponIdToBaseWeaponId(anyWeapon.id)] ?? null;
}

interface ReceiverDamages {
	receiver: DamageReceiver;
	hitPoints: number;
	damages: Array<{
		value: number;
		hitsToDestroy: number;
		/** the rate of every hit that deals damage (one, or direct + explosion for "Combined"), Object Shredder included */
		multipliers: Array<number>;
		type: CalculatorDamageType;
		id: string;
		distance: Damage["distance"];
		objectShredder: boolean;
	}>;
}

function calculateCombinedDamage({
	analyzed,
	anyWeapon,
	abilityPoints,
	combined,
	isMultiShot,
}: {
	analyzed: AnalyzedBuild;
	anyWeapon: AnyWeapon;
	abilityPoints: AbilityPoints;
	combined: CombinedDamage;
	isMultiShot: boolean;
}): Array<ReceiverDamages> {
	const hits = [combined.direct, combined.explosion].map((damageType) => {
		const [damage] = resolveFilteredDamages({
			analyzed,
			damageType,
			isMultiShot,
			anyWeapon,
		});
		invariant(damage, `${damageType} damage not found`);

		return {
			damage,
			rates: multipliersToRecordWithFallbacks(
				damageTypeToMultipliers({ type: damageType, weapon: anyWeapon }),
			),
		};
	});
	const directHit = hits[0];
	const hitPoints = objectHitPoints(abilityPoints);

	return DAMAGE_RECEIVERS.map((receiver) => {
		const countedHits = ignoresExplosion({ anyWeapon, receiver })
			? [directHit]
			: hits;

		return {
			receiver,
			hitPoints: hitPoints[receiver],
			damages: [false, true].map((objectShredder) => {
				const multipliers = countedHits.map(
					(hit) =>
						hit.rates[receiver] *
						(objectShredder ? objectShredderMultiplier(receiver) : 1),
				);
				const damagePerHit = R.round(
					R.sum(countedHits.map((hit, i) => hit.damage.value * multipliers[i])),
					2,
				);

				return {
					value: damagePerHit,
					hitsToDestroy: Math.ceil(hitPoints[receiver] / damagePerHit),
					multipliers: multipliers.map((multiplier) => R.round(multiplier, 2)),
					type: COMBINED_DAMAGE_TYPE,
					id: `${directHit.damage.id}-${COMBINED_DAMAGE_TYPE}-${String(objectShredder)}`,
					distance: directHit.damage.distance,
					objectShredder,
				};
			}),
		};
	});
}

// in-game bug: Booyah Bomb armor ignores the explosion of a fully charged Tri-Stringer arrow
function ignoresExplosion({
	anyWeapon,
	receiver,
}: {
	anyWeapon: AnyWeapon;
	receiver: DamageReceiver;
}) {
	return (
		anyWeapon.type === "MAIN" &&
		weaponIdToBaseWeaponId(anyWeapon.id) === 7010 &&
		receiver === "NiceBall_Armor"
	);
}

function objectShredderMultiplier(receiver: DamageReceiver) {
	return (
		objectShredderMultipliers.find((m) => m.target === receiver)?.rate ?? 1
	);
}
