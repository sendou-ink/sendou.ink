import { specialWeaponParams } from "~/features/build-analyzer/core/utils";
import type { SpecialWeaponId } from "~/modules/in-game-lists/types";
import { specialWeaponIds } from "~/modules/in-game-lists/weapon-ids";
import {
	calculateGroundRange,
	simulateTrajectoryPoints,
	type TrajectoryParams,
} from "./weapon-range";

const DEFAULT_BRAKE_AIR_RESIST = 0.36;
const DEFAULT_BRAKE_GRAVITY = 0.07;
const DEFAULT_BRAKE_TO_FREE_FRAME = 4;
const DEFAULT_FREE_GRAVITY = 0.016;
const DEFAULT_FREE_AIR_RESIST = 0;

export interface SpecialWeaponRangeResult {
	/** Radius of the range circle, in game distance units. */
	range: number;
	/** Extra outer radius covered by the projectile's blast, in game distance units. */
	blastRadius?: number;
	rangeType: "projectile" | "radius";
}

/**
 * Range circle definition for a special weapon, or `null` when the special has no meaningful
 * range to draw. The underlying values come from `weapon-params.ts` (populated by
 * `scripts/create-analyzer-json.ts`): projectile specials reuse the main weapon trajectory
 * model, the rest carry a single effect radius.
 */
export function getSpecialWeaponRange(
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

	if (params.Range_SpawnSpeed === undefined) return null;

	const trajectoryParams: TrajectoryParams = {
		spawnSpeed: params.Range_SpawnSpeed,
		goStraightStateEndMaxSpeed:
			params.Range_GoStraightStateEndMaxSpeed ?? params.Range_SpawnSpeed,
		goStraightToBrakeStateFrame: params.Range_GoStraightToBrakeStateFrame ?? 4,
		freeGravity: params.Range_FreeGravity ?? DEFAULT_FREE_GRAVITY,
		freeAirResist: params.Range_FreeAirResist ?? DEFAULT_FREE_AIR_RESIST,
		brakeAirResist: params.Range_BrakeAirResist ?? DEFAULT_BRAKE_AIR_RESIST,
		brakeGravity: params.Range_BrakeGravity ?? DEFAULT_BRAKE_GRAVITY,
		brakeToFreeFrame:
			params.Range_BrakeToFreeStateFrame ?? DEFAULT_BRAKE_TO_FREE_FRAME,
	};

	const range = calculateGroundRange(
		simulateTrajectoryPoints(trajectoryParams),
	);

	return {
		range,
		blastRadius: params.Range_BlastRadius,
		rangeType: "projectile",
	};
}

export interface SpecialWeaponWithRange extends SpecialWeaponRangeResult {
	specialWeaponId: SpecialWeaponId;
}

/**
 * Every special weapon that has a range to draw, widest first. Specials without a meaningful
 * range circle are omitted.
 */
export function getSpecialsWithRange(): SpecialWeaponWithRange[] {
	return specialWeaponIds
		.flatMap((specialWeaponId): SpecialWeaponWithRange[] => {
			const result = getSpecialWeaponRange(specialWeaponId);
			return result ? [{ specialWeaponId, ...result }] : [];
		})
		.sort((a, b) => b.range - a.range);
}
