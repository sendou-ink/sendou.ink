/**
 * How far main weapons shoot: a frame by frame simulation of a shot's flight (straight, braking,
 * then falling) from the weapon's params, chargers reaching their charge distance in a line.
 * Distances are in game units, measured from a player standing on flat ground.
 */

import type {
	DistanceDamage,
	RangeParams,
	RangeVariantKey,
} from "~/features/build-analyzer/analyzer-types";
import { mainWeaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { weaponCategories } from "~/modules/in-game-lists/weapon-ids";

/** Flight params of a shot, `Range_*` of the weapon's params with the game's defaults filled in. */
export interface TrajectoryParams {
	spawnSpeed: number;
	/** Upward angle of the shot in degrees */
	spawnAngle: number;
	/** How far in front of the player the shot spawns */
	spawnOffsetZ: number;
	goStraightStateEndMaxSpeed: number;
	goStraightToBrakeStateFrame: number;
	freeGravity: number;
	freeAirResist: number;
	brakeAirResist: number;
	brakeGravity: number;
	brakeToFreeFrame: number;
	brakeToFreeVelocityY: number;
	burstFrame?: number;
	bounceAfterMaxSpeed?: number;
}

/** A shot's position: `z` the distance travelled forward, `y` the height above the ground. */
export interface TrajectoryPoint {
	z: number;
	y: number;
}

const DEFAULT_GO_STRAIGHT_TO_BRAKE_STATE_FRAME = 4;
const DEFAULT_BRAKE_AIR_RESIST = 0.36;
const DEFAULT_BRAKE_GRAVITY = 0.07;
const DEFAULT_BRAKE_TO_FREE_FRAME = 4;
const DEFAULT_BRAKE_TO_FREE_VELOCITY_Y = -0.15;
const DEFAULT_FREE_GRAVITY = 0.016;
const DEFAULT_FREE_AIR_RESIST = 0.02;

/** Damage (in tenths of HP) it takes to splat a player */
const SPLAT_DAMAGE = 1000;

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

/** Flight params of `Range_*` params with the game's defaults filled in, `null` when they have no speed. */
export function trajectoryParams(
	params: Omit<RangeParams, "Range_DistanceDamage">,
): TrajectoryParams | null {
	if (params.Range_SpawnSpeed === undefined) return null;

	return {
		spawnSpeed: params.Range_SpawnSpeed,
		spawnAngle: params.Range_SpawnAngle ?? 0,
		spawnOffsetZ: params.Range_SpawnOffsetZ ?? 0,
		goStraightStateEndMaxSpeed:
			params.Range_GoStraightStateEndMaxSpeed ?? params.Range_SpawnSpeed,
		goStraightToBrakeStateFrame:
			params.Range_GoStraightToBrakeStateFrame ??
			DEFAULT_GO_STRAIGHT_TO_BRAKE_STATE_FRAME,
		freeGravity: params.Range_FreeGravity ?? DEFAULT_FREE_GRAVITY,
		freeAirResist: params.Range_FreeAirResist ?? DEFAULT_FREE_AIR_RESIST,
		brakeAirResist: params.Range_BrakeAirResist ?? DEFAULT_BRAKE_AIR_RESIST,
		brakeGravity: params.Range_BrakeGravity ?? DEFAULT_BRAKE_GRAVITY,
		brakeToFreeFrame:
			params.Range_BrakeToFreeStateFrame ?? DEFAULT_BRAKE_TO_FREE_FRAME,
		brakeToFreeVelocityY:
			params.Range_BrakeToFreeVelocityY ?? DEFAULT_BRAKE_TO_FREE_VELOCITY_Y,
		burstFrame: params.Range_BurstFrame,
		bounceAfterMaxSpeed: params.Range_BounceAfterMaxSpeed,
	};
}

/**
 * The shot's position on every frame until it lands, bursts or stops. The brake phase ends early once
 * the shot falls faster than `brakeToFreeVelocityY`. Bouncing shots (`bounceAfterMaxSpeed` set)
 * bounce `burstFrame` times instead of landing.
 */
export function simulateTrajectory(
	params: TrajectoryParams,
): TrajectoryPoint[] {
	const {
		spawnSpeed,
		spawnAngle,
		spawnOffsetZ,
		goStraightStateEndMaxSpeed,
		goStraightToBrakeStateFrame,
		freeGravity,
		freeAirResist,
		brakeAirResist,
		brakeGravity,
		brakeToFreeFrame,
		brakeToFreeVelocityY,
		burstFrame,
		bounceAfterMaxSpeed,
	} = params;

	const isBouncing = bounceAfterMaxSpeed !== undefined;
	const maxBounces =
		isBouncing && burstFrame !== undefined ? burstFrame : undefined;
	const maxFrames = isBouncing ? 300 : (burstFrame ?? 300);

	const points: TrajectoryPoint[] = [];
	const angleRadians = (spawnAngle * Math.PI) / 180;
	let z = spawnOffsetZ;
	let y = PLAYER_HEIGHT;
	let vz = spawnSpeed * Math.cos(angleRadians);
	let vy = spawnSpeed * Math.sin(angleRadians);
	let frame = 0;
	let bounceCount = 0;

	points.push({ z, y });

	while (frame < goStraightToBrakeStateFrame && frame < maxFrames) {
		z += vz;
		y += vy;
		points.push({ z, y });
		frame++;
	}

	const speed = Math.hypot(vz, vy);
	if (speed > goStraightStateEndMaxSpeed) {
		vz *= goStraightStateEndMaxSpeed / speed;
		vy *= goStraightStateEndMaxSpeed / speed;
	}

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

		if (vy < brakeToFreeVelocityY) break;
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

/** How many hits splat at point blank and up to which distance that many still do. */
export interface LethalRange {
	shots: number;
	distance: number;
}

/**
 * Lethal range of damage falling off linearly between `distanceDamage` points (rollers, brushes),
 * `null` when the weapon splats in the same number of hits at every distance.
 */
export function lethalRange(
	distanceDamage: DistanceDamage[],
): LethalRange | null {
	const [closest] = distanceDamage;
	if (!closest || closest.Damage <= 0) return null;

	const shots = Math.ceil(SPLAT_DAMAGE / closest.Damage);
	const threshold = SPLAT_DAMAGE / shots;

	for (let i = 1; i < distanceDamage.length; i++) {
		const near = distanceDamage[i - 1];
		const far = distanceDamage[i];
		if (far.Damage >= threshold) continue;

		const t = (near.Damage - threshold) / (near.Damage - far.Damage);
		return {
			shots,
			distance: near.Distance + t * (far.Distance - near.Distance),
		};
	}

	return null;
}

/** Range of a main weapon, `unsupported` for weapons the model can't simulate. */
export interface WeaponRangeResult {
	range: number;
	blastRadius?: number;
	rangeType: "calculated" | "direct" | "unsupported";
	trajectory?: TrajectoryPoint[];
	lethal?: LethalRange;
}

/** One way of shooting a weapon with its range, `key` `null` for weapons that only have one. */
export interface WeaponRangeVariant extends WeaponRangeResult {
	key: RangeVariantKey | null;
	isDefault: boolean;
}

/** Range of a main weapon's default way of shooting with the trajectory it was measured from. */
export function ofMainWeapon(weaponId: MainWeaponId): WeaponRangeResult {
	return variantsOf(weaponId)[0];
}

/** Every way of shooting a main weapon (a roller's vertical and horizontal swing…), the default first. */
export function variantsOf(weaponId: MainWeaponId): WeaponRangeVariant[] {
	const category = getWeaponCategoryName(weaponId);

	if (!category) {
		return [{ key: null, isDefault: true, range: 0, rangeType: "unsupported" }];
	}

	const params = mainWeaponParams(weaponId);
	const defaultRangeParams: RangeParams =
		category === "CHARGERS" && params.DistanceFullCharge !== undefined
			? { Range_Distance: params.DistanceFullCharge }
			: params;

	return [
		{
			key: params.Range_VariantKey ?? null,
			isDefault: true,
			...rangeOf(defaultRangeParams),
		},
		...(params.Range_Variants ?? []).map((variant) => ({
			key: variant.Range_VariantKey,
			isDefault: false,
			...rangeOf(variant),
		})),
	];
}

function rangeOf(params: RangeParams): WeaponRangeResult {
	const lethal = params.Range_DistanceDamage
		? (lethalRange(params.Range_DistanceDamage) ?? undefined)
		: undefined;

	if (params.Range_Distance !== undefined) {
		return {
			range: params.Range_Distance,
			rangeType: "direct",
			trajectory: [
				{ z: 0, y: PLAYER_HEIGHT },
				{ z: params.Range_Distance, y: PLAYER_HEIGHT },
			],
			lethal,
		};
	}

	const flightParams = trajectoryParams(params);
	if (!flightParams) {
		return { range: 0, rangeType: "unsupported" };
	}

	const trajectory = simulateTrajectory(flightParams);
	const range =
		params.Range_BounceAfterMaxSpeed !== undefined
			? bouncingRange(trajectory)
			: groundRange(trajectory);

	return {
		range,
		blastRadius: params.BlastRadius,
		rangeType: "calculated",
		trajectory,
		lethal,
	};
}

/** A comp's weapon with the ways of shooting it that are shown. */
export interface WeaponWithRange {
	weaponId: MainWeaponId;
	/** Position in the comp, kept through the filtering so duplicates stay apart */
	slot: number;
	/** Shown ways of shooting, default first when it is one of them */
	variants: WeaponRangeVariant[];
	/** Every way of shooting the weapon has, empty when it has only one */
	allVariantKeys: RangeVariantKey[];
}

/**
 * Ranges of a comp's weapons, the ones the model can't simulate left out. `enabledVariantKeys` picks
 * which ways of shooting a weapon are shown, its default when it returns none it has.
 */
export function ofWeapons(
	weaponIds: MainWeaponId[],
	enabledVariantKeys: (weaponId: MainWeaponId) => RangeVariantKey[] = () => [],
): WeaponWithRange[] {
	return weaponIds.flatMap((weaponId, slot) => {
		const all = variantsOf(weaponId).filter(
			(variant) => variant.rangeType !== "unsupported",
		);
		if (all.length === 0) return [];

		const enabledKeys = enabledVariantKeys(weaponId);
		const enabled = all.filter(
			(variant) => variant.key !== null && enabledKeys.includes(variant.key),
		);

		return [
			{
				weaponId,
				slot,
				variants: enabled.length > 0 ? enabled : [all[0]],
				allVariantKeys: all.flatMap((variant) =>
					variant.key !== null ? [variant.key] : [],
				),
			},
		];
	});
}

/**
 * Ways of shooting a comp's weapon to show after toggling `key`: empty when only the default is left,
 * `null` when the toggle would hide every one of them.
 */
export function toggleVariant(
	weapon: WeaponWithRange,
	key: RangeVariantKey,
): RangeVariantKey[] | null {
	const shownKeys = weapon.variants.flatMap((variant) =>
		variant.key !== null ? [variant.key] : [],
	);
	const nextKeys = weapon.allVariantKeys.filter((variantKey) =>
		variantKey === key
			? !shownKeys.includes(variantKey)
			: shownKeys.includes(variantKey),
	);

	if (nextKeys.length === 0) return null;
	if (nextKeys.length === 1 && nextKeys[0] === weapon.allVariantKeys[0]) {
		return [];
	}

	return nextKeys;
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
