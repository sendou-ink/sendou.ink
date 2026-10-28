/**
 * How far main weapons shoot: a frame by frame simulation of a shot's flight (straight, braking,
 * then falling) from the weapon's params, chargers reaching their full charge distance in a line.
 * Distances are in game units, measured from a player standing on flat ground.
 */

import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";

/** Flight params of a shot, `Range_*` of the weapon's params with the game's defaults filled in. */
export interface TrajectoryParams {
	spawnSpeed: number;
	goStraightStateEndMaxSpeed: number;
	goStraightToBrakeStateFrame: number;
	freeGravity: number;
	freeAirResist: number;
	brakeAirResist: number;
	brakeGravity: number;
	brakeToFreeFrame: number;
	burstFrame?: number;
	bounceAfterMaxSpeed?: number;
}

/** A shot's position: `z` the distance travelled forward, `y` the height above the ground. */
export interface TrajectoryPoint {
	z: number;
	y: number;
}

const DEFAULT_BRAKE_AIR_RESIST = 0.36;
const DEFAULT_BRAKE_GRAVITY = 0.07;
const DEFAULT_BRAKE_TO_FREE_FRAME = 4;
const DEFAULT_FREE_GRAVITY = 0.016;
const DEFAULT_FREE_AIR_RESIST = 0;

function getWeaponCategoryName(weaponId: MainWeaponId): string | undefined {
	for (const category of weaponCategories) {
		if (category.weaponIds.some((id) => id === weaponId)) {
			return category.name;
		}
	}
	return undefined;
}

const PLAYER_HEIGHT = 1.0;

/** Distance at which a trajectory first reaches the ground, its last point's when it never does. */
export function groundRange(trajectory: TrajectoryPoint[]): number {
	for (let i = 1; i < trajectory.length; i++) {
		const point = trajectory[i];
		const prevPoint = trajectory[i - 1];
		if (point.y < 0 && prevPoint.y >= 0) {
			const t = prevPoint.y / (prevPoint.y - point.y);
			return prevPoint.z + t * (point.z - prevPoint.z);
		}
	}
	const lastPoint = trajectory[trajectory.length - 1];
	return lastPoint?.z ?? 0;
}

function bouncingRange(trajectory: TrajectoryPoint[]): number {
	const lastPoint = trajectory[trajectory.length - 1];
	return lastPoint?.z ?? 0;
}

/**
 * The shot's position on every frame until it lands, bursts or stops. Bouncing shots
 * (`bounceAfterMaxSpeed` set) bounce `burstFrame` times instead of landing.
 */
export function simulateTrajectory(
	params: TrajectoryParams,
): TrajectoryPoint[] {
	const {
		spawnSpeed,
		goStraightStateEndMaxSpeed,
		goStraightToBrakeStateFrame,
		freeGravity,
		freeAirResist,
		brakeAirResist,
		brakeGravity,
		brakeToFreeFrame,
		burstFrame,
		bounceAfterMaxSpeed,
	} = params;

	const isBouncing = bounceAfterMaxSpeed !== undefined;
	const maxBounces =
		isBouncing && burstFrame !== undefined ? burstFrame : undefined;
	const maxFrames = isBouncing ? 300 : (burstFrame ?? 300);

	const points: TrajectoryPoint[] = [];
	let z = 0;
	let y = PLAYER_HEIGHT;
	let vz = spawnSpeed;
	let vy = 0;
	let frame = 0;
	let bounceCount = 0;

	points.push({ z, y });

	while (frame < goStraightToBrakeStateFrame && frame < maxFrames) {
		z += vz;
		points.push({ z, y });
		frame++;
	}

	vz = Math.min(vz, goStraightStateEndMaxSpeed);

	for (let i = 0; i < brakeToFreeFrame && frame < maxFrames; i++) {
		vz *= 1 - brakeAirResist;
		vy = (1 - brakeAirResist) * vy - brakeGravity;
		z += vz;
		y += vy;
		points.push({ z, y });
		frame++;

		if (y < 0) {
			if (isBouncing) {
				bounceCount++;
				if (maxBounces !== undefined && bounceCount >= maxBounces) {
					return points;
				}
				y = Math.abs(y);
				vy = Math.abs(vy);
				vz *= bounceAfterMaxSpeed;
			} else {
				return points;
			}
		}
	}

	while (frame < maxFrames) {
		vz *= 1 - freeAirResist;
		vy = (1 - freeAirResist) * vy - freeGravity;
		z += vz;
		y += vy;

		if (y < 0) {
			if (isBouncing) {
				bounceCount++;
				if (maxBounces !== undefined && bounceCount >= maxBounces) {
					points.push({ z, y: 0 });
					return points;
				}
				y = Math.abs(y);
				vy = Math.abs(vy);
				vz *= bounceAfterMaxSpeed;
			} else {
				points.push({ z, y });
				return points;
			}
		}

		points.push({ z, y });
		frame++;

		if (!isBouncing && y < 0) {
			return points;
		}

		if (vz < 0.01) {
			return points;
		}
	}

	return points;
}

/** Range of a main weapon, `unsupported` for weapons the model can't simulate. */
export interface WeaponRangeResult {
	range: number;
	blastRadius?: number;
	rangeType: "calculated" | "direct" | "unsupported";
	trajectory?: TrajectoryPoint[];
}

/** Range of a main weapon with the trajectory it was measured from. */
export function ofMainWeapon(weaponId: MainWeaponId): WeaponRangeResult {
	const category = getWeaponCategoryName(weaponId);

	if (!category) {
		return { range: 0, rangeType: "unsupported" };
	}

	const params = mainWeaponParams(weaponId);

	if (category === "CHARGERS" && params.DistanceFullCharge !== undefined) {
		const range = params.DistanceFullCharge;
		return {
			range,
			rangeType: "direct",
			trajectory: [
				{ z: 0, y: PLAYER_HEIGHT },
				{ z: range, y: PLAYER_HEIGHT },
			],
		};
	}

	if (params.Range_SpawnSpeed === undefined) {
		return { range: 0, rangeType: "unsupported" };
	}

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
		burstFrame: params.Range_BurstFrame,
		bounceAfterMaxSpeed: params.Range_BounceAfterMaxSpeed,
	};

	const trajectory = simulateTrajectory(trajectoryParams);
	const range =
		params.Range_BounceAfterMaxSpeed !== undefined
			? bouncingRange(trajectory)
			: groundRange(trajectory);

	return {
		range,
		blastRadius: params.BlastRadius,
		rangeType: "calculated",
		trajectory,
	};
}

/** A comp's weapon with its range. */
export interface WeaponWithRange {
	weaponId: MainWeaponId;
	/** Position in the comp, kept through the filtering so duplicates stay apart */
	slot: number;
	range: number;
	blastRadius?: number;
	rangeType: "calculated" | "direct" | "unsupported";
	trajectory?: TrajectoryPoint[];
}

/** Ranges of a comp's weapons, the ones the model can't simulate left out. */
export function ofWeapons(weaponIds: MainWeaponId[]): WeaponWithRange[] {
	return weaponIds
		.map((weaponId, slot) => {
			const result = ofMainWeapon(weaponId);
			return {
				weaponId,
				slot,
				...result,
			};
		})
		.filter((w) => w.rangeType !== "unsupported");
}

/** Weapons drawn under every comp's ranges for scale: Splattershot and Snipewriter 5H. */
export const BENCHMARK_WEAPON_IDS = [40, 2070] satisfies MainWeaponId[];

/** Trajectory of a benchmark weapon. */
export interface BenchmarkTrajectory {
	id: MainWeaponId;
	range: number;
	trajectory?: TrajectoryPoint[];
}

/** Trajectories of the benchmark weapons. */
export function benchmarkTrajectories(): BenchmarkTrajectory[] {
	return BENCHMARK_WEAPON_IDS.map((weaponId) => {
		const result = ofMainWeapon(weaponId);
		return {
			id: weaponId,
			range: result.range,
			trajectory: result.trajectory,
		};
	}).filter((b) => b.trajectory !== undefined);
}
