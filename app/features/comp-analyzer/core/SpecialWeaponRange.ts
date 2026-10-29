/**
 * Range circles of special weapons, as drawn on the map planner and the comp analyzer. Projectile
 * specials (Trizooka, Crab Tank…) reuse the main weapon trajectory model of `WeaponRange`, area
 * specials carry a radius in their params.
 */

import {
	mainWeaponParams,
	specialWeaponParams,
} from "~/features/build-analyzer/core/utils";
import type {
	MainWeaponId,
	SpecialWeaponId,
} from "~/modules/in-game-lists/types";
import { specialWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import * as WeaponRange from "./WeaponRange";

/** Range of a special: how far its projectile flies, or the radius of its area. */
export interface SpecialWeaponRangeResult {
	/** In game distance units. */
	range: number;
	/** Extra outer radius of the projectile's blast, in game distance units. */
	blastRadius?: number;
	rangeType: "projectile" | "radius";
}

/**
 * Range circle of a special, or `null` when it has none worth drawing. Values come from
 * `weapon-params.ts`: projectile specials reuse the main weapon trajectory model, the rest carry a radius.
 */
export function ofSpecial(
	specialWeaponId: SpecialWeaponId,
): SpecialWeaponRangeResult | null {
	const params = specialWeaponParams(specialWeaponId);

	if (params.Range_Radius !== undefined) {
		return { range: params.Range_Radius, rangeType: "radius" };
	}

	if (params.Range_Distance !== undefined) {
		return {
			range: params.Range_Distance,
			blastRadius: params.Range_BlastRadius,
			rangeType: "projectile",
		};
	}

	const flightParams = WeaponRange.trajectoryParams(params);
	if (!flightParams) return null;

	const range = WeaponRange.groundRange(
		WeaponRange.simulateTrajectory(flightParams),
	);

	return {
		range,
		blastRadius: params.Range_BlastRadius,
		rangeType: "projectile",
	};
}

/** A special with its range. */
export interface SpecialWeaponWithRange extends SpecialWeaponRangeResult {
	specialWeaponId: SpecialWeaponId;
}

/** The special of a comp's weapon with its range. */
export interface CompSpecialWithRange extends SpecialWeaponWithRange {
	/** Position of the weapon in the comp */
	slot: number;
}

/** Ranges of the specials of a comp's weapons in comp order, the ones without a range to draw left out. */
export function ofWeapons(weaponIds: MainWeaponId[]): CompSpecialWithRange[] {
	return weaponIds.flatMap((weaponId, slot) => {
		const { specialWeaponId } = mainWeaponParams(weaponId);
		const result = ofSpecial(specialWeaponId);
		return result ? [{ slot, specialWeaponId, ...result }] : [];
	});
}

/** Every special with a range to draw, widest first. */
export function allSpecials(): SpecialWeaponWithRange[] {
	return specialWeaponIds
		.flatMap((specialWeaponId): SpecialWeaponWithRange[] => {
			const result = ofSpecial(specialWeaponId);
			return result ? [{ specialWeaponId, ...result }] : [];
		})
		.sort((a, b) => b.range - a.range);
}
