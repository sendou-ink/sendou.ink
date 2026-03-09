import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";

interface TrajectoryParams {
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

function calculateGroundRange(trajectory: TrajectoryPoint[]): number {
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

function calculateBouncingRange(trajectory: TrajectoryPoint[]): number {
	const lastPoint = trajectory[trajectory.length - 1];
	return lastPoint?.z ?? 0;
}

function simulateTrajectoryPoints(params: TrajectoryParams): TrajectoryPoint[] {
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
		vy -= brakeGravity;
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
		vy -= freeGravity;
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

export interface WeaponRangeResult {
	range: number;
	blastRadius?: number;
	rangeType: "calculated" | "direct" | "unsupported";
	trajectory?: TrajectoryPoint[];
}

function getWeaponRange(weaponId: MainWeaponId): WeaponRangeResult {
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

	const trajectory = simulateTrajectoryPoints(trajectoryParams);
	const range =
		params.Range_BounceAfterMaxSpeed !== undefined
			? calculateBouncingRange(trajectory)
			: calculateGroundRange(trajectory);

	return {
		range,
		blastRadius: params.BlastRadius,
		rangeType: "calculated",
		trajectory,
	};
}

export interface WeaponWithRange {
	weaponId: MainWeaponId;
	range: number;
	blastRadius?: number;
	rangeType: "calculated" | "direct" | "unsupported";
	trajectory?: TrajectoryPoint[];
}

export function getWeaponsWithRange(
	weaponIds: MainWeaponId[],
): WeaponWithRange[] {
	return weaponIds
		.map((weaponId) => {
			const result = getWeaponRange(weaponId);
			return {
				weaponId,
				...result,
			};
		})
		.filter((w) => w.rangeType !== "unsupported");
}

export const BENCHMARK_WEAPON_IDS = [40, 2070] satisfies MainWeaponId[];

export interface BenchmarkTrajectory {
	id: MainWeaponId;
	range: number;
	trajectory?: TrajectoryPoint[];
}

export function getBenchmarkTrajectories(): BenchmarkTrajectory[] {
	return BENCHMARK_WEAPON_IDS.map((weaponId) => {
		const result = getWeaponRange(weaponId);
		return {
			id: weaponId,
			range: result.range,
			trajectory: result.trajectory,
		};
	}).filter((b) => b.trajectory !== undefined);
}
