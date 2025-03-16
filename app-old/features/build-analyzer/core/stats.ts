import {
	AUTO_BOMB_ID,
	type Ability,
	BURST_BOMB_ID,
	CRAB_TANK_ID,
	CURLING_BOMB_ID,
	FIZZY_BOMB_ID,
	type MainWeaponId,
	SPLASH_WALL_ID,
	SPLAT_BOMB_ID,
	SPRINKLER_ID,
	SUCTION_BOMB_ID,
	type SubWeaponId,
	TORPEDO_ID,
	ZIPCASTER_ID,
	subWeaponIds,
} from "~/modules/in-game-lists";
import {
	ANGLE_SHOOTER_ID,
	INK_MINE_ID,
	POINT_SENSOR_ID,
} from "~/modules/in-game-lists";
import invariant from "~/utils/invariant";
import {
	cutToNDecimalPlaces,
	roundToNDecimalPlaces,
	sumArray,
} from "~/utils/number";
import { semiRandomId } from "~/utils/strings";
import { assertUnreachable } from "~/utils/types";
import {
	DAMAGE_TYPE,
	RAINMAKER_SPEED_PENALTY_MODIFIER,
	multiShot,
} from "../analyzer-constants";
import type {
	AbilityPoints,
	AnalyzedBuild,
	DamageType,
	InkConsumeType,
	MainWeaponParams,
	SpecialWeaponParams,
	StatFunctionInput,
	SubWeaponParams,
} from "../analyzer-types";
import { INK_CONSUME_TYPES } from "../analyzer-types";
import type { abilityValues as abilityValuesJson } from "./ability-values";
import {
	abilityPointsToEffects,
	abilityValues,
	apFromMap,
	hasEffect,
	hpDivided,
	weaponParams,
} from "./utils";

export function buildStats({
	weaponSplId,
	abilityPoints = new Map(),
	mainOnlyAbilities = [],
	hasTacticooler,
}: {
	weaponSplId: MainWeaponId;
	abilityPoints?: AbilityPoints;
	mainOnlyAbilities?: Array<Ability>;
	hasTacticooler: boolean;
}): AnalyzedBuild {
	const mainWeaponParams = weaponParams().mainWeapons[weaponSplId];
	invariant(mainWeaponParams, `Weapon with splId ${weaponSplId} not found`);

	const subWeaponParams =
		weaponParams().subWeapons[mainWeaponParams.subWeaponId];
	invariant(
		subWeaponParams,
		`Sub weapon with splId ${mainWeaponParams.subWeaponId} not found`,
	);

	const specialWeaponParams =
		weaponParams().specialWeapons[mainWeaponParams.specialWeaponId];
	invariant(
		specialWeaponParams,
		`Special weapon with splId ${mainWeaponParams.specialWeaponId} not found`,
	);

	const input: StatFunctionInput = {
		weaponSplId,
		mainWeaponParams,
		subWeaponParams,
		specialWeaponParams,
		abilityPoints,
		mainOnlyAbilities,
		hasTacticooler,
	};

	return {
		weapon: {
			subWeaponSplId: mainWeaponParams.subWeaponId,
			specialWeaponSplId: mainWeaponParams.specialWeaponId,
			brellaCanopyHp:
				mainWeaponParams.CanopyHP && mainWeaponParams.CanopyHP / 10,
			fullChargeSeconds: mainWeaponParams.ChargeFrameFullCharge
				? framesToSeconds(mainWeaponParams.ChargeFrameFullCharge)
				: undefined,
			maxChargeHoldSeconds: mainWeaponParams.KeepChargeFullFrame
				? framesToSeconds(mainWeaponParams.KeepChargeFullFrame)
				: undefined,
			speedType: mainWeaponParams.WeaponSpeedType ?? "Normal",
			multiShots: multiShot[weaponSplId],
		},
		stats: {
			specialPoint: specialPoint(input),
			specialLost: specialLost(input),
			specialLostSplattedByRP: specialLost(input, true),
			fullInkTankOptions: fullInkTankOptions(input),
			damages: damages(input),
			specialWeaponDamages: specialWeaponDamages(input),
			subWeaponDefenseDamages: subWeaponDefenseDamages(input),
			mainWeaponWhiteInkSeconds:
				typeof mainWeaponParams.InkRecoverStop === "number"
					? framesToSeconds(mainWeaponParams.InkRecoverStop)
					: undefined,
			subWeaponWhiteInkSeconds: framesToSeconds(subWeaponParams.InkRecoverStop),
			subWeaponInkConsumptionPercentage:
				subWeaponInkConsumptionPercentage(input),
			squidFormInkRecoverySeconds: squidFormInkRecoverySeconds(input),
			humanoidFormInkRecoverySeconds: humanoidFormInkRecoverySeconds(input),
			runSpeed: runSpeed(input),
			shootingRunSpeed: shootingRunSpeed(input, "MoveSpeed"),
			shootingRunSpeedCharging: shootingRunSpeed(input, "MoveSpeed_Charge"),
			shootingRunSpeedFullCharge: shootingRunSpeed(
				input,
				"MoveSpeedFullCharge",
			),
			shootingRunSpeedSecondaryMode: shootingRunSpeed(
				input,
				"MoveSpeedVariable",
			),
			swimSpeed: swimSpeed(input),
			swimSpeedHoldingRainmaker: swimSpeedHoldingRainmaker(input),
			runSpeedInEnemyInk: runSpeedInEnemyInk(input),
			damageTakenInEnemyInkPerSecond: damageTakenInEnemyInkPerSecond(input),
			enemyInkDamageLimit: enemyInkDamageLimit(input),
			framesBeforeTakingDamageInEnemyInk:
				framesBeforeTakingDamageInEnemyInk(input),
			quickRespawnTime: respawnTime(input),
			quickRespawnTimeSplattedByRP: respawnTime(input, true),
			superJumpTimeGroundFrames: superJumpTimeGroundFrames(input),
			superJumpTimeTotal: superJumpTimeTotal(input),
			shotSpreadAir: shotSpreadAir(input),
			shotSpreadGround: mainWeaponParams.Stand_DegSwerve,
			shotAutofireSpreadAir: shotAutofireSpreadAir(input),
			shotAutofireSpreadGround: mainWeaponParams.Variable_Stand_DegSwerve,
			squidSurgeChargeFrames: squidSurgeChargeFrames(input),
			subDefPointSensorMarkedTimeInSeconds:
				subDefPointSensorMarkedTimeInSeconds(input),
			subDefInkMineMarkedTimeInSeconds: subDefInkMineMarkedTimeInSeconds(input),
			subDefAngleShooterMarkedTimeInSeconds:
				subDefAngleShooterMarkedTimeInSeconds(input),
			subDefToxicMistMovementReduction: subDefToxicMistMovementReduction(input),
			subQsjBoost: subQsjBoost(input),
			...subStats(input),
			specialDurationInSeconds: specialDurationInSeconds(input),
			specialDamageDistance: specialDamageDistance(input),
			specialPaintRadius: specialPaintRadius(input),
			specialFieldHp: specialFieldHp(input),
			specialDeviceHp: specialDeviceHp(input),
			specialHookInkConsumptionPercentage:
				specialHookInkConsumptionPercentage(input),
			specialInkConsumptionPerSecondPercentage:
				specialInkConsumptionPerSecondPercentage(input),
			specialReticleRadius: specialReticleRadius(input),
			specialThrowDistance: specialThrowDistance(input),
			specialMoveSpeed: specialMoveSpeed(input),
			specialAutoChargeRate: specialAutoChargeRate(input),
			specialMaxRadius: specialMaxRadius(input),
			specialRadiusRangeMin: specialRadiusRangeMin(input),
			specialRadiusRangeMax: specialRadiusRangeMax(input),
			specialPowerUpDuration: specialPowerUpDuration(input),
		},
	};
}

const SPLATTERSHOT_JR_ID = 10;
const CUSTOM_SPLATTERSHOT_JR_ID = 11;
function inkTankSize(weaponSplId: StatFunctionInput["weaponSplId"]) {
	if ([SPLATTERSHOT_JR_ID, CUSTOM_SPLATTERSHOT_JR_ID].includes(weaponSplId)) {
		return 1.1;
	}

	return 1;
}

function specialPoint({
	abilityPoints,
	mainWeaponParams,
}: StatFunctionInput): AnalyzedBuild["stats"]["specialPoint"] {
	const SPECIAL_POINT_ABILITY = "SCU";

	const { effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: abilityPoints,
			ability: SPECIAL_POINT_ABILITY,
		}),
		key: "IncreaseRt_Special",
		weapon: mainWeaponParams,
	});

	return {
		baseValue: mainWeaponParams.SpecialPoint,
		modifiedBy: SPECIAL_POINT_ABILITY,
		value: Math.ceil(mainWeaponParams.SpecialPoint / effect),
	};
}

const OWN_RESPAWN_PUNISHER_EXTRA_SPECIAL_LOST = 0.225;
const ENEMY_RESPAWN_PUNISHER_EXTRA_SPECIAL_LOST = 0.15;
function specialLost(
	{ abilityPoints, mainWeaponParams, mainOnlyAbilities }: StatFunctionInput,
	splattedByRP = false,
): AnalyzedBuild["stats"]["specialPoint"] {
	const SPECIAL_SAVED_AFTER_DEATH_ABILITY = "SS";
	const hasRespawnPunisher = mainOnlyAbilities.includes("RP");
	const extraSpecialLost = hasRespawnPunisher
		? OWN_RESPAWN_PUNISHER_EXTRA_SPECIAL_LOST
		: 0;

	const specialSavedAfterDeathForDisplay = (effect: number) =>
		Number(((1.0 - effect) * 100).toFixed(2));

	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: abilityPoints,
			ability: SPECIAL_SAVED_AFTER_DEATH_ABILITY,
		}),
		key: "SpecialGaugeRt_Restart",
		weapon: mainWeaponParams,
	});

	const splattedByExtraPenalty = splattedByRP
		? ENEMY_RESPAWN_PUNISHER_EXTRA_SPECIAL_LOST
		: 0;

	return {
		baseValue: specialSavedAfterDeathForDisplay(
			baseEffect - splattedByExtraPenalty,
		),
		value: specialSavedAfterDeathForDisplay(
			effect - splattedByExtraPenalty - extraSpecialLost,
		),
		modifiedBy: [SPECIAL_SAVED_AFTER_DEATH_ABILITY, "RP"],
	};
}

function subWeaponInkConsumptionPercentage(args: StatFunctionInput) {
	return {
		modifiedBy: "ISS" as const,
		baseValue: roundToNDecimalPlaces(
			(args.subWeaponParams.InkConsume * 100) / inkTankSize(args.weaponSplId),
		),
		value: roundToNDecimalPlaces(
			// + 0.004 is a hack to avoid situation where the value is e.g. 50.0005
			// -> rounds to 50% so it appears you can throw two subs
			// which is not correct so we force the round upwards
			(subWeaponConsume(args).inkConsume * 100 + 0.0045) /
				inkTankSize(args.weaponSplId),
		),
	};
}

export function fullInkTankOptions(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["fullInkTankOptions"] {
	const result: AnalyzedBuild["stats"]["fullInkTankOptions"] = [];

	const { inkConsume: subWeaponInkConsume, maxSubsFromFullInkTank } =
		subWeaponConsume(args);

	for (
		let subsFromFullInkTank = 0;
		subsFromFullInkTank <= maxSubsFromFullInkTank;
		subsFromFullInkTank++
	) {
		for (const type of INK_CONSUME_TYPES) {
			const mainWeaponInkConsume = mainWeaponInkConsumeByType({
				type,
				...args,
			});

			if (typeof mainWeaponInkConsume !== "number") continue;

			result.push({
				id: semiRandomId(),
				subsUsed: subsFromFullInkTank,
				type,
				value: effectToRounded(
					(inkTankSize(args.weaponSplId) -
						subWeaponInkConsume * subsFromFullInkTank) /
						mainWeaponInkConsume,
					2,
				),
			});
		}
	}

	return result;
}

function effectToRounded(effect: number, decimals = 3) {
	return Number(effect.toFixed(decimals));
}

function subWeaponConsume({
	mainWeaponParams,
	subWeaponParams,
	abilityPoints,
	weaponSplId,
}: StatFunctionInput) {
	const { effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints,
			ability: "ISS",
		}),
		key: `ConsumeRt_Sub_Lv${subWeaponParams.SubInkSaveLv}`,
		weapon: mainWeaponParams,
	});

	const inkConsume = subWeaponParams.InkConsume;

	const inkConsumeAfterISS = inkConsume * effect;

	return {
		inkConsume: inkConsumeAfterISS,
		maxSubsFromFullInkTank: Math.floor(
			inkTankSize(weaponSplId) / inkConsumeAfterISS,
		),
	};
}

function mainWeaponInkConsumeByType({
	mainWeaponParams,
	abilityPoints,
	type,
}: {
	type: InkConsumeType;
} & StatFunctionInput) {
	const { effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints,
			ability: "ISM",
		}),
		key: "ConsumeRt_Main",
		weapon: mainWeaponParams,
	});

	// these keys are always mutually exclusive i.e. even if inkConsumeTypeToParamsKeys() returns many keys
	// then weapon params of this weapon should only have one defined
	for (const key of inkConsumeTypeToParamsKeys(type)) {
		const value = mainWeaponParams[key];

		if (typeof value === "number") {
			return value * effect;
		}
	}

	// not all weapons have all ink consume types
	// i.e. blaster does not (hopefully) perform dualie dodge rolls
	return;
}

function inkConsumeTypeToParamsKeys(
	type: InkConsumeType,
): Array<keyof MainWeaponParams> {
	switch (type) {
		case "NORMAL":
			return ["InkConsume", "InkConsume_WeaponShelterShotgunParam"];
		case "SWING":
			return ["InkConsume_SwingParam", "InkConsume_WeaponSwingParam"];
		case "SLOSH":
			return ["InkConsumeSlosher"];
		case "TAP_SHOT":
			return ["InkConsumeMinCharge"];
		case "FULL_CHARGE":
			return ["InkConsumeFullCharge", "InkConsumeFullCharge_ChargeParam"];
		case "SPLATLING_CHARGE":
			return ["InkConsumeFullChargeSplatling"];
		case "HORIZONTAL_SWING":
			return ["InkConsume_WeaponWideSwingParam"];
		case "VERTICAL_SWING":
			return ["InkConsume_WeaponVerticalSwingParam"];
		case "DUALIE_ROLL":
			return ["InkConsume_SideStepParam"];
		case "SHIELD_LAUNCH":
			return ["InkConsumeUmbrella_WeaponShelterCanopyParam"];
		default: {
			assertUnreachable(type);
		}
	}
}

const damageTypeToParamsKey: Record<
	DamageType,
	| keyof MainWeaponParams
	| keyof SubWeaponParams
	| keyof SpecialWeaponParams
	| Array<
			keyof MainWeaponParams | keyof SubWeaponParams | keyof SpecialWeaponParams
	  >
> = {
	NORMAL_MIN: "DamageParam_ValueMin",
	NORMAL_MAX: "DamageParam_ValueMax",
	NORMAL_MAX_FULL_CHARGE: "DamageParam_ValueFullChargeMax",
	TURRET_MAX: "DamageLapOverParam_ValueMax",
	TURRET_MIN: "DamageLapOverParam_ValueMin",
	SECONDARY_MODE_MAX: "Variable_Damage_ValueMax",
	SECONDARY_MODE_MIN: "Variable_Damage_ValueMin",
	DIRECT: "DamageParam_ValueDirect",
	DIRECT_MIN: "DamageParam_ValueDirectMin",
	DIRECT_MAX: "DamageParam_ValueDirectMax",
	DIRECT_SECONDARY_MIN: "DamageParam_Secondary_ValueDirectMin",
	DIRECT_SECONDARY_MAX: "DamageParam_Secondary_ValueDirectMax",
	DISTANCE: ["BlastParam_DistanceDamage", "DistanceDamage_BlastParamArray"],
	SPLASH: ["BlastParam_SplashDamage", "DistanceDamage_SplashBlastParam"],
	SPLASH_MIN: "SwingUnitGroupParam_DamageParam_DamageMinValue",
	SPLASH_MAX: "SwingUnitGroupParam_DamageParam_DamageMaxValue",
	SPLASH_HORIZONTAL_MIN: "WideSwingUnitGroupParam_DamageParam_DamageMinValue",
	SPLASH_HORIZONTAL_MAX: "WideSwingUnitGroupParam_DamageParam_DamageMaxValue",
	SPLASH_VERTICAL_MIN: "VerticalSwingUnitGroupParam_DamageParam_DamageMinValue",
	SPLASH_VERTICAL_MAX: "VerticalSwingUnitGroupParam_DamageParam_DamageMaxValue",
	ROLL_OVER: "BodyParam_Damage",
	FULL_CHARGE: "DamageParam_ValueFullCharge",
	MAX_CHARGE: "DamageParam_ValueMaxCharge",
	TAP_SHOT: "DamageParam_ValueMinCharge",
	SPLATANA_VERTICAL: "DamageParam_SplatanaVertical",
	SPLATANA_VERTICAL_DIRECT: "DamageParam_SplatanaVerticalDirect",
	SPLATANA_HORIZONTAL: "DamageParam_SplatanaHorizontal",
	SPLATANA_HORIZONTAL_DIRECT: "DamageParam_SplatanaHorizontalDirect",
	BOMB_NORMAL: "DistanceDamage",
	BOMB_DIRECT: ["DirectDamage", "DistanceDamage_BlastParamChase"],
	WAVE: "WaveDamage",
	SPECIAL_MAX_CHARGE: "ExhaleBlastParamMaxChargeDistanceDamage",
	SPECIAL_MIN_CHARGE: "ExhaleBlastParamMinChargeDistanceDamage",
	SPECIAL_SWING: "SwingDamage",
	SPECIAL_THROW: "ThrowDamage",
	SPECIAL_THROW_DIRECT: "ThrowDirectDamage",
	SPECIAL_BULLET_MAX: "BulletDamageMax",
	SPECIAL_BULLET_MIN: "BulletDamageMin",
	SPECIAL_CANNON: "CannonDamage",
	SPECIAL_BUMP: "BumpDamage",
	SPECIAL_JUMP: "JumpDamage",
	SPECIAL_TICK: "TickDamage",
};

function damages(args: StatFunctionInput): AnalyzedBuild["stats"]["damages"] {
	const result: AnalyzedBuild["stats"]["damages"] = [];

	for (const type of DAMAGE_TYPE) {
		for (const key of [damageTypeToParamsKey[type]].flat()) {
			const value = args.mainWeaponParams[key as keyof MainWeaponParams];

			if (Array.isArray(value)) {
				for (const subValue of value.flat()) {
					result.push({
						type,
						value: subValue.Damage / 10,
						distance: subValue.Distance,
						id: semiRandomId(),
						multiShots: multiShot[args.weaponSplId],
					});
				}

				continue;
			}

			if (typeof value !== "number") continue;

			result.push({
				id: semiRandomId(),
				type,
				value: value / 10,
				shotsToSplat: shotsToSplat({
					value,
					type,
					multiShots: multiShot[args.weaponSplId],
				}),
				multiShots: multiShot[args.weaponSplId],
			});
		}
	}

	return result;
}

function specialWeaponDamages(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialWeaponDamages"] {
	const result: AnalyzedBuild["stats"]["specialWeaponDamages"] = [];

	for (const type of DAMAGE_TYPE) {
		for (const key of [damageTypeToParamsKey[type]].flat()) {
			const value = args.specialWeaponParams[key as keyof SpecialWeaponParams];

			if (Array.isArray(value)) {
				for (const subValue of value.flat()) {
					result.push({
						type,
						value: subValue.Damage / 10,
						distance: subValue.Distance,
						id: semiRandomId(),
						multiShots: multiShot[args.weaponSplId],
					});
				}

				continue;
			}

			if (typeof value !== "number") continue;

			result.push({
				id: semiRandomId(),
				type,
				value: value / 10,
				shotsToSplat: shotsToSplat({
					value,
					type,
					multiShots: multiShot[args.weaponSplId],
				}),
				multiShots: multiShot[args.weaponSplId],
			});
		}
	}

	// Artifically combined damages
	if (args.mainWeaponParams.specialWeaponId === ZIPCASTER_ID) {
		result.unshift({
			id: semiRandomId(),
			distance: 0,
			value: sumArray(result.map((v) => v.value)),
			type: result[0].type,
		});
	}
	if (args.mainWeaponParams.specialWeaponId === CRAB_TANK_ID) {
		const cannonDamages = result.filter((d) => d.type === "SPECIAL_CANNON");
		const firstCannonDamageIdx = result.findIndex(
			(d) => d.type === "SPECIAL_CANNON",
		);

		result.splice(firstCannonDamageIdx, 0, {
			id: semiRandomId(),
			distance: 0,
			value: sumArray(cannonDamages.map((v) => v.value)),
			type: "SPECIAL_CANNON",
		});
	}

	return result;
}

function shotsToSplat({
	value,
	type,
	multiShots,
}: {
	value: number;
	type: DamageType;
	multiShots?: number;
}) {
	if (!["NORMAL_MAX", "NORMAL_MAX_FULL_CHARGE", "DIRECT"].includes(type)) {
		return;
	}

	const multiplier = multiShots ? multiShots : 1;

	return Math.ceil(1000 / (value * multiplier));
}

function subWeaponDefenseDamages(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["subWeaponDefenseDamages"] {
	const result: AnalyzedBuild["stats"]["subWeaponDefenseDamages"] = [];

	const abilityPoints = apFromMap({
		ability: "SRU",
		abilityPoints: args.abilityPoints,
	});

	for (const id of subWeaponIds) {
		const params = weaponParams().subWeapons[id];

		for (const type of DAMAGE_TYPE) {
			for (const key of [damageTypeToParamsKey[type]].flat()) {
				const value = params[key as keyof SubWeaponParams];

				if (Array.isArray(value)) {
					let arrayValues: AnalyzedBuild["stats"]["subWeaponDefenseDamages"] =
						[];
					for (const subValue of value.flat()) {
						arrayValues.push({
							type,
							baseValue: subValue.Damage / 10,
							value: subWeaponDamageValue({
								baseValue: subValue.Damage / 10,
								subWeaponId: id,
								abilityPoints,
								params: args.subWeaponParams,
							}),
							distance: subValue.Distance,
							id: semiRandomId(),
							subWeaponId: id,
						});
					}

					// Burst Bomb direct damage
					if (id === BURST_BOMB_ID) {
						arrayValues.unshift({
							id: semiRandomId(),
							subWeaponId: id,
							distance: 0,
							baseValue: sumArray(arrayValues.map((v) => v.baseValue)),
							value: cutToNDecimalPlaces(
								sumArray(arrayValues.map((v) => v.value)),
								1,
							),
							type,
						});
					}

					// Flatten many values into one
					if (id === FIZZY_BOMB_ID || id === CURLING_BOMB_ID) {
						const allArrayValues = arrayValues.sort(
							(a, b) => a.baseValue - b.baseValue,
						);
						const firstHalfValues = allArrayValues.slice(
							0,
							allArrayValues.length / 2,
						);
						const secondHalfValues = allArrayValues.slice(
							allArrayValues.length / 2,
						);

						arrayValues = [
							{
								id: semiRandomId(),
								subWeaponId: id,
								distance: [
									Math.min(
										...secondHalfValues.map(
											(value) => value.distance as number,
										),
									),
									Math.max(
										...secondHalfValues.map(
											(value) => value.distance as number,
										),
									),
								],
								baseValue: secondHalfValues[0].baseValue,
								value: secondHalfValues[0].value,
								type,
							},
							{
								id: semiRandomId(),
								subWeaponId: id,
								distance: [
									Math.min(
										...firstHalfValues.map((value) => value.distance as number),
									),
									Math.max(
										...firstHalfValues.map((value) => value.distance as number),
									),
								],
								baseValue: firstHalfValues[0].baseValue,
								value: firstHalfValues[0].value,
								type,
							},
						];
					}

					result.push(...arrayValues);

					continue;
				}

				if (typeof value !== "number") continue;

				result.push({
					id: semiRandomId(),
					type,
					baseValue: value / 10,
					value: subWeaponDamageValue({
						baseValue: value / 10,
						subWeaponId: id,
						abilityPoints,
						params: args.subWeaponParams,
					}),
					subWeaponId: id,
					distance: 0,
				});
			}
		}
	}

	return result;
}

function subWeaponIdToEffectKey(
	subWeaponId: SubWeaponId,
): keyof typeof abilityValuesJson {
	switch (subWeaponId) {
		case SPLAT_BOMB_ID:
		case SUCTION_BOMB_ID:
		case CURLING_BOMB_ID:
		case AUTO_BOMB_ID:
		case INK_MINE_ID:
		case TORPEDO_ID:
			return "DamageRt_BombH";
		case BURST_BOMB_ID:
		case FIZZY_BOMB_ID:
			return "DamageRt_BombL";
		case ANGLE_SHOOTER_ID:
			return "DamageRt_LineMarker";
		case SPRINKLER_ID:
			return "DamageRt_Sprinkler";
		case SPLASH_WALL_ID:
			return "DamageRt_Shield";
		default:
			throw new Error(
				`No damage rate for the sub weapon with id: ${subWeaponId}`,
			);
	}
}

function subWeaponDamageValue({
	baseValue,
	subWeaponId,
	abilityPoints,
	params,
}: {
	baseValue: number;
	subWeaponId: SubWeaponId;
	params: SubWeaponParams;
	abilityPoints: number;
}): number {
	// lethal damage cannot be lowered
	if (baseValue > 100) return baseValue;

	const { effect } = abilityPointsToEffects({
		abilityPoints,
		key: subWeaponIdToEffectKey(subWeaponId),
		weapon: params,
	});

	// Lean: The HP are ints between 0 and 1000 consistently
	return cutToNDecimalPlaces(baseValue * effect, 1);
}

const framesToSeconds = (frames: number) =>
	effectToRounded(Math.ceil(frames) / 60);
function squidFormInkRecoverySeconds(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["squidFormInkRecoverySeconds"] {
	const SQUID_FORM_INK_RECOVERY_SECONDS_ABILITY = "IRU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SQUID_FORM_INK_RECOVERY_SECONDS_ABILITY,
		}),
		key: "InkRecoverFrm_Stealth",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: framesToSeconds(baseEffect * inkTankSize(args.weaponSplId)),
		value: framesToSeconds(effect * inkTankSize(args.weaponSplId)),
		modifiedBy: SQUID_FORM_INK_RECOVERY_SECONDS_ABILITY,
	};
}

function humanoidFormInkRecoverySeconds(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["humanoidFormInkRecoverySeconds"] {
	const HUMANOID_FORM_INK_RECOVERY_SECONDS_ABILITY = "IRU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: HUMANOID_FORM_INK_RECOVERY_SECONDS_ABILITY,
		}),
		key: "InkRecoverFrm_Std",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: framesToSeconds(baseEffect * inkTankSize(args.weaponSplId)),
		value: framesToSeconds(effect * inkTankSize(args.weaponSplId)),
		modifiedBy: HUMANOID_FORM_INK_RECOVERY_SECONDS_ABILITY,
	};
}

function runSpeed(args: StatFunctionInput): AnalyzedBuild["stats"]["runSpeed"] {
	const key =
		args.mainWeaponParams.WeaponSpeedType === "Fast"
			? "_Fast"
			: args.mainWeaponParams.WeaponSpeedType === "Slow"
				? "_Slow"
				: "";
	const RUN_SPEED_ABILITY = "RSU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: RUN_SPEED_ABILITY,
		}),
		key: `MoveVel_Human${key}`,
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: effectToRounded(baseEffect * 10),
		value: effectToRounded(effect * 10),
		modifiedBy: RUN_SPEED_ABILITY,
	};
}

function runSpeedInEnemyInk(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["runSpeedInEnemyInk"] {
	const RUN_SPEED_IN_ENEMY_INK_ABILITY = "RES";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: RUN_SPEED_IN_ENEMY_INK_ABILITY,
		}),
		key: "OpInk_MoveVel",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: effectToRounded(baseEffect * 10),
		value: effectToRounded(effect * 10),
		modifiedBy: RUN_SPEED_IN_ENEMY_INK_ABILITY,
	};
}

function shootingRunSpeed(
	args: StatFunctionInput,
	keyName:
		| "MoveSpeed"
		| "MoveSpeed_Charge"
		| "MoveSpeedFullCharge"
		| "MoveSpeedVariable",
): AnalyzedBuild["stats"]["shootingRunSpeed"] {
	const SHOOTING_RUN_SPEED_ABILITY = "RSU";
	const moveSpeed = args.mainWeaponParams[keyName];

	if (!moveSpeed) return;

	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SHOOTING_RUN_SPEED_ABILITY,
		}),
		key: "MoveVelRt_Shot",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: effectToRounded(moveSpeed * baseEffect * 10),
		value: effectToRounded(moveSpeed * effect * 10),
		modifiedBy: SHOOTING_RUN_SPEED_ABILITY,
	};
}

function swimSpeed(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["swimSpeed"] {
	const key =
		args.mainWeaponParams.WeaponSpeedType === "Fast"
			? "_Fast"
			: args.mainWeaponParams.WeaponSpeedType === "Slow"
				? "_Slow"
				: "";
	const SWIM_SPEED_ABILITY = "SSU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SWIM_SPEED_ABILITY,
		}),
		key: `MoveVel_Stealth${key}`,
		weapon: args.mainWeaponParams,
	});

	const ninjaSquidMultiplier = args.mainOnlyAbilities.includes("NS") ? 0.9 : 1;

	return {
		baseValue: effectToRounded(baseEffect * 10),
		value: effectToRounded(effect * 10 * ninjaSquidMultiplier),
		modifiedBy: [SWIM_SPEED_ABILITY, "NS"],
	};
}

function swimSpeedHoldingRainmaker(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["swimSpeedHoldingRainmaker"] {
	const withoutRM = swimSpeed(args);

	return {
		...withoutRM,
		baseValue: effectToRounded(
			withoutRM.baseValue * RAINMAKER_SPEED_PENALTY_MODIFIER,
		),
		value: effectToRounded(withoutRM.value * RAINMAKER_SPEED_PENALTY_MODIFIER),
	};
}

const qrApAfterRespawnPunish = ({
	ap,
	hasTacticooler,
}: {
	ap: number;
	hasTacticooler: boolean;
}) => (hasTacticooler ? ap : Math.ceil(ap * 0.15));

const RESPAWN_CHASE_FRAME = 150;
const OWN_RESPAWN_PUNISHER_EXTRA_RESPAWN_FRAMES = 68;
const ENEMY_RESPAWN_PUNISHER_EXTRA_RESPAWN_FRAMES = 45;
const SPLATOON_3_FASTER_RESPAWN = 60;
function respawnTime(
	args: StatFunctionInput,
	splattedByRP = false,
): AnalyzedBuild["stats"]["quickRespawnTime"] {
	const QUICK_RESPAWN_TIME_ABILITY = "QR";
	const hasRespawnPunisher = args.mainOnlyAbilities.includes("RP");

	const ap = apFromMap({
		abilityPoints: args.abilityPoints,
		ability: QUICK_RESPAWN_TIME_ABILITY,
	});
	const abilityPoints = splattedByRP
		? qrApAfterRespawnPunish({
				ap,
				hasTacticooler: args.hasTacticooler,
			})
		: ap;

	const chase = abilityPointsToEffects({
		abilityPoints,
		key: "Dying_ChaseFrm",
		weapon: args.mainWeaponParams,
	});
	const around = abilityPointsToEffects({
		abilityPoints,
		key: "Dying_AroundFrm",
		weapon: args.mainWeaponParams,
	});

	const ownRPExtraFrames = hasRespawnPunisher
		? OWN_RESPAWN_PUNISHER_EXTRA_RESPAWN_FRAMES
		: 0;

	const splattedByExtraFrames = splattedByRP
		? ENEMY_RESPAWN_PUNISHER_EXTRA_RESPAWN_FRAMES
		: 0;

	return {
		baseValue: framesToSeconds(
			RESPAWN_CHASE_FRAME +
				chase.baseEffect +
				splattedByExtraFrames +
				around.baseEffect -
				SPLATOON_3_FASTER_RESPAWN,
		),
		value: framesToSeconds(
			RESPAWN_CHASE_FRAME +
				chase.effect +
				around.effect +
				splattedByExtraFrames +
				ownRPExtraFrames -
				SPLATOON_3_FASTER_RESPAWN,
		),
		modifiedBy: [QUICK_RESPAWN_TIME_ABILITY, "RP"],
	};
}

function superJumpTimeGroundFrames(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["superJumpTimeGroundFrames"] {
	const SUPER_JUMP_TIME_GROUND_ABILITY = "QSJ";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SUPER_JUMP_TIME_GROUND_ABILITY,
		}),
		key: "SuperJump_ChargeFrm",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: Math.ceil(baseEffect),
		value: Math.ceil(effect),
		modifiedBy: SUPER_JUMP_TIME_GROUND_ABILITY,
	};
}

function superJumpTimeTotal(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["superJumpTimeTotal"] {
	const SUPER_JUMP_TIME_TOTAL_ABILITY = "QSJ";

	const charge = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SUPER_JUMP_TIME_TOTAL_ABILITY,
		}),
		key: "SuperJump_ChargeFrm",
		weapon: args.mainWeaponParams,
	});
	const move = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SUPER_JUMP_TIME_TOTAL_ABILITY,
		}),
		key: "SuperJump_MoveFrm",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: framesToSeconds(
			Math.ceil(charge.baseEffect) + Math.ceil(move.baseEffect),
		),
		value: framesToSeconds(Math.ceil(charge.effect) + Math.ceil(move.effect)),
		modifiedBy: SUPER_JUMP_TIME_TOTAL_ABILITY,
	};
}

function shotSpreadAir(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["shotSpreadAir"] {
	const SHOT_SPREAD_AIR_ABILITY = "IA";
	const groundSpread = args.mainWeaponParams.Stand_DegSwerve;
	const jumpSpread = args.mainWeaponParams.Jump_DegSwerve;

	if (
		typeof jumpSpread !== "number" ||
		typeof groundSpread !== "number" ||
		jumpSpread === groundSpread
	)
		return;

	const { effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SHOT_SPREAD_AIR_ABILITY,
		}),
		key: "ReduceJumpSwerveRate",
		weapon: args.mainWeaponParams,
	});

	const extraSpread = jumpSpread - groundSpread;
	const reducedExtraSpread = extraSpread * (1 - effect);

	return {
		baseValue: roundToNDecimalPlaces(jumpSpread),
		value: roundToNDecimalPlaces(reducedExtraSpread + groundSpread),
		modifiedBy: SHOT_SPREAD_AIR_ABILITY,
	};
}

function shotAutofireSpreadAir(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["shotAutofireSpreadAir"] {
	const SHOT_SPREAD_AIR_ABILITY = "IA";
	const groundSpread = args.mainWeaponParams.Variable_Stand_DegSwerve;
	const jumpSpread = args.mainWeaponParams.Variable_Jump_DegSwerve;

	if (
		typeof jumpSpread !== "number" ||
		typeof groundSpread !== "number" ||
		jumpSpread === groundSpread
	)
		return;

	const { effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SHOT_SPREAD_AIR_ABILITY,
		}),
		key: "ReduceJumpSwerveRate",
		weapon: args.mainWeaponParams,
	});

	const extraSpread = jumpSpread - groundSpread;
	const reducedExtraSpread = extraSpread * (1 - effect);

	return {
		baseValue: roundToNDecimalPlaces(jumpSpread),
		value: roundToNDecimalPlaces(reducedExtraSpread + groundSpread),
		modifiedBy: SHOT_SPREAD_AIR_ABILITY,
	};
}

function squidSurgeChargeFrames(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["squidSurgeChargeFrames"] {
	const SQUID_SURGE_CHARGE_FRAMES_ABILITY = "IA";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SQUID_SURGE_CHARGE_FRAMES_ABILITY,
		}),
		key: "WallJumpChargeFrm",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: Math.ceil(baseEffect),
		value: Math.ceil(effect),
		modifiedBy: SQUID_SURGE_CHARGE_FRAMES_ABILITY,
	};
}

function damageTakenInEnemyInkPerSecond(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["damageTakenInEnemyInkPerSecond"] {
	const DAMAGE_TAKEN_IN_ENEMY_INK_ABILITY = "RES";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: DAMAGE_TAKEN_IN_ENEMY_INK_ABILITY,
		}),
		key: "OpInk_DamagePerFrame",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: effectToDamage(baseEffect) * 60,
		value: effectToDamage(effect) * 60,
		modifiedBy: DAMAGE_TAKEN_IN_ENEMY_INK_ABILITY,
	};
}

function enemyInkDamageLimit(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["enemyInkDamageLimit"] {
	const ENEMY_INK_DAMAGE_LIMIT_ABILITY = "RES";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: ENEMY_INK_DAMAGE_LIMIT_ABILITY,
		}),
		key: "OpInk_DamageLmt",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: effectToDamage(baseEffect),
		value: effectToDamage(effect),
		modifiedBy: ENEMY_INK_DAMAGE_LIMIT_ABILITY,
	};
}

function effectToDamage(effect: number) {
	// not sure where the 0.05 is coming from. Old analyzer had it as well so assuming it's correct.
	return Number((effect * 100 - 0.05).toFixed(1));
}

function framesBeforeTakingDamageInEnemyInk(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["framesBeforeTakingDamageInEnemyInk"] {
	const FRAMES_BEFORE_TAKING_DAMAGE_IN_ENEMY_INK_ABILITY = "RES";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: FRAMES_BEFORE_TAKING_DAMAGE_IN_ENEMY_INK_ABILITY,
		}),
		key: "OpInk_ArmorHP",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: Math.ceil(baseEffect),
		value: Math.ceil(effect),
		modifiedBy: FRAMES_BEFORE_TAKING_DAMAGE_IN_ENEMY_INK_ABILITY,
	};
}

const SUB_WEAPON_STATS = [
	{
		analyzedBuildKey: "subVelocity",
		abilityValuesKey: "SpawnSpeedZSpecUp",
		type: "SUB_VELOCITY",
	},
	{
		analyzedBuildKey: "subFirstPhaseDuration",
		abilityValuesKey: "PeriodFirst",
		type: "TIME",
	},
	{
		analyzedBuildKey: "subSecondPhaseDuration",
		abilityValuesKey: "PeriodSecond",
		type: "TIME",
	},
	{
		analyzedBuildKey: "subMarkingTimeInSeconds",
		abilityValuesKey: "MarkingFrameSubSpec",
		type: "TIME",
	},
	{
		analyzedBuildKey: "subMarkingRadius",
		abilityValuesKey: "SensorRadius",
		type: "NO_CHANGE",
	},
	{
		analyzedBuildKey: "subExplosionRadius",
		abilityValuesKey: "ExplosionRadius",
		type: "NO_CHANGE",
	},
	{ analyzedBuildKey: "subHp", abilityValuesKey: "MaxHP", type: "HP" },
] as const;
export function subStats(
	args: Pick<StatFunctionInput, "subWeaponParams" | "abilityPoints">,
) {
	const result: Partial<AnalyzedBuild["stats"]> = {};
	const SUB_STATS_KEY = "BRU";

	for (const { analyzedBuildKey, abilityValuesKey, type } of SUB_WEAPON_STATS) {
		if (!hasEffect({ key: abilityValuesKey, weapon: args.subWeaponParams })) {
			continue;
		}
		const { baseEffect, effect } = abilityPointsToEffects({
			abilityPoints: apFromMap({
				abilityPoints: args.abilityPoints,
				ability: SUB_STATS_KEY,
			}),
			key: abilityValuesKey,
			weapon: args.subWeaponParams,
		});

		const toValue = (effect: number) => {
			switch (type) {
				case "NO_CHANGE":
					return roundToNDecimalPlaces(effect);
				case "SUB_VELOCITY":
					return roundToNDecimalPlaces(effect, 3);
				case "HP":
					return roundToNDecimalPlaces(hpDivided(effect), 1);
				case "TIME":
					return framesToSeconds(effect);
				default:
					assertUnreachable(type);
			}
		};

		result[analyzedBuildKey] = {
			baseValue: toValue(baseEffect),
			modifiedBy: SUB_STATS_KEY,
			value: toValue(effect),
		};
	}

	return result;
}

function subDefPointSensorMarkedTimeInSeconds(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["subDefPointSensorMarkedTimeInSeconds"] {
	const SUB_DEF_POINT_SENSOR_MARKED_TIME_IN_SECONDS_KEY = "SRU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SUB_DEF_POINT_SENSOR_MARKED_TIME_IN_SECONDS_KEY,
		}),
		key: "MarkingTimeRt",
		weapon: args.mainWeaponParams,
	});

	const pointSensorParams = weaponParams().subWeapons[POINT_SENSOR_ID];

	const { baseEffect: markingTimeEffect } = abilityPointsToEffects({
		abilityPoints: 0,
		key: "MarkingFrameSubSpec",
		weapon: pointSensorParams,
	});

	return {
		baseValue: framesToSeconds(markingTimeEffect * baseEffect),
		modifiedBy: SUB_DEF_POINT_SENSOR_MARKED_TIME_IN_SECONDS_KEY,
		value: framesToSeconds(markingTimeEffect * effect),
	};
}

function subDefInkMineMarkedTimeInSeconds(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["subDefInkMineMarkedTimeInSeconds"] {
	const SUB_DEF_INK_MINE_MARKED_TIME_IN_SECONDS_KEY = "SRU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SUB_DEF_INK_MINE_MARKED_TIME_IN_SECONDS_KEY,
		}),
		key: "MarkingTimeRt_Trap",
		weapon: args.mainWeaponParams,
	});

	const inkMineParams = weaponParams().subWeapons[INK_MINE_ID];

	const { baseEffect: markingTimeEffect } = abilityPointsToEffects({
		abilityPoints: 0,
		key: "MarkingFrameSubSpec",
		weapon: inkMineParams,
	});

	return {
		baseValue: framesToSeconds(markingTimeEffect * baseEffect),
		modifiedBy: SUB_DEF_INK_MINE_MARKED_TIME_IN_SECONDS_KEY,
		value: framesToSeconds(markingTimeEffect * effect),
	};
}

function subDefAngleShooterMarkedTimeInSeconds(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["subDefAngleShooterMarkedTimeInSeconds"] {
	const SUB_DEF_ANGLE_SHOOTER_MARKED_TIME_IN_SECONDS_KEY = "SRU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SUB_DEF_ANGLE_SHOOTER_MARKED_TIME_IN_SECONDS_KEY,
		}),
		key: "MarkingTimeRt",
		weapon: args.mainWeaponParams,
	});

	const angleShooterParams = weaponParams().subWeapons[ANGLE_SHOOTER_ID];

	const { baseEffect: markingTimeEffect } = abilityPointsToEffects({
		abilityPoints: 0,
		key: "MarkingFrameSubSpec",
		weapon: angleShooterParams,
	});

	return {
		baseValue: framesToSeconds(markingTimeEffect * baseEffect),
		modifiedBy: SUB_DEF_ANGLE_SHOOTER_MARKED_TIME_IN_SECONDS_KEY,
		value: framesToSeconds(markingTimeEffect * effect),
	};
}

function subDefToxicMistMovementReduction(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["subDefToxicMistMovementReduction"] {
	const SUB_DEF_TOXIC_MIST_MOVEMENT_REDUCTION_KEY = "SRU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SUB_DEF_TOXIC_MIST_MOVEMENT_REDUCTION_KEY,
		}),
		key: "MoveDownRt_PoisonMist",
		weapon: args.mainWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(baseEffect * 100),
		value: roundToNDecimalPlaces(effect * 100),
		modifiedBy: SUB_DEF_TOXIC_MIST_MOVEMENT_REDUCTION_KEY,
	};
}

function subQsjBoost(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["subQsjBoost"] {
	if (
		!hasEffect({
			key: "SubSpecUpParam",
			weapon: args.subWeaponParams,
		})
	) {
		return;
	}

	const SUB_QSJ_BOOST_KEY = "BRU";

	// Lean: This is the base that is used with their weird formula (I didn't even bother renaming the vars and just used what my disassembler gave me)
	const calculate = (ap: number) => {
		const multiplier = abilityValues({
			key: "SubSpecUpParam",
			weapon: args.subWeaponParams,
		});

		const v7 =
			((multiplier[1] - multiplier[2]) / multiplier[0] - 17.8 / multiplier[0]) /
			((17.8 / multiplier[0]) * (17.8 / multiplier[0] + -1.0));

		const v8 = (ap / multiplier[0]) * ((ap / multiplier[0]) * v7 + (1.0 - v7));

		return Math.floor(multiplier[2] + (multiplier[0] - multiplier[2]) * v8);
	};

	return {
		baseValue: calculate(0),
		value: calculate(args.abilityPoints.get(SUB_QSJ_BOOST_KEY) ?? 0),
		modifiedBy: SUB_QSJ_BOOST_KEY,
	};
}

function specialDurationInSeconds(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialDurationInSeconds"] {
	if (
		!hasEffect({
			key: "SpecialDurationFrame",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_DURATION_IN_SECONDS_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_DURATION_IN_SECONDS_KEY,
		}),
		key: "SpecialDurationFrame",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: framesToSeconds(baseEffect),
		value: framesToSeconds(effect),
		modifiedBy: SPECIAL_DURATION_IN_SECONDS_KEY,
	};
}

function specialDamageDistance(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialDamageDistance"] {
	if (
		!hasEffect({
			key: "DistanceDamageDistanceRate",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_DAMAGE_DISTANCE_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_DAMAGE_DISTANCE_KEY,
		}),
		key: "DistanceDamageDistanceRate",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(baseEffect, 4),
		value: roundToNDecimalPlaces(effect, 4),
		modifiedBy: SPECIAL_DAMAGE_DISTANCE_KEY,
	};
}

function specialPaintRadius(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialPaintRadius"] {
	for (const key of ["PaintRadius", "CrossPaintRadius"] as const) {
		if (!hasEffect({ key, weapon: args.specialWeaponParams })) {
			continue;
		}

		const SPECIAL_PAINT_RADIUS_KEY = "SPU";
		const { baseEffect, effect } = abilityPointsToEffects({
			abilityPoints: apFromMap({
				abilityPoints: args.abilityPoints,
				ability: SPECIAL_PAINT_RADIUS_KEY,
			}),
			key,
			weapon: args.specialWeaponParams,
		});

		return {
			baseValue: roundToNDecimalPlaces(baseEffect, 4),
			value: roundToNDecimalPlaces(effect, 4),
			modifiedBy: SPECIAL_PAINT_RADIUS_KEY,
		};
	}

	return;
}

export function specialFieldHp(
	args: Pick<StatFunctionInput, "specialWeaponParams" | "abilityPoints">,
): AnalyzedBuild["stats"]["specialFieldHp"] {
	if (!hasEffect({ key: "MaxFieldHP", weapon: args.specialWeaponParams })) {
		return;
	}

	const SPECIAL_FIELD_HP_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_FIELD_HP_KEY,
		}),
		key: "MaxFieldHP",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: Math.round(baseEffect / 10),
		value: Math.round(effect / 10),
		modifiedBy: SPECIAL_FIELD_HP_KEY,
	};
}

export function specialDeviceHp(
	args: Pick<StatFunctionInput, "specialWeaponParams" | "abilityPoints">,
): AnalyzedBuild["stats"]["specialDeviceHp"] {
	if (!hasEffect({ key: "MaxHP", weapon: args.specialWeaponParams })) {
		return;
	}

	const SPECIAL_DEVICE_HP_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_DEVICE_HP_KEY,
		}),
		key: "MaxHP",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: Math.round(hpDivided(baseEffect)),
		value: Math.round(hpDivided(effect)),
		modifiedBy: SPECIAL_DEVICE_HP_KEY,
	};
}

// GameParameters -> WeaponParam -> InkCapacityRt
const ZIPCASTER_INKTANK_SIZE = 1.5;

function specialHookInkConsumptionPercentage(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialHookInkConsumptionPercentage"] {
	if (
		!hasEffect({
			key: "InkConsume_Hook",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_HOOK_INK_CONSUMPTION_PERCENTAGE_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_HOOK_INK_CONSUMPTION_PERCENTAGE_KEY,
		}),
		key: "InkConsume_Hook",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(
			(baseEffect * 100) / ZIPCASTER_INKTANK_SIZE,
		),
		value: roundToNDecimalPlaces((effect * 100) / ZIPCASTER_INKTANK_SIZE),
		modifiedBy: SPECIAL_HOOK_INK_CONSUMPTION_PERCENTAGE_KEY,
	};
}

function specialInkConsumptionPerSecondPercentage(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialInkConsumptionPerSecondPercentage"] {
	if (
		!hasEffect({
			key: "InkConsume_PerSec",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_INK_CONSUMPTION_PER_SECOND_PERCENTAGE_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_INK_CONSUMPTION_PER_SECOND_PERCENTAGE_KEY,
		}),
		key: "InkConsume_PerSec",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(
			(baseEffect * 100) / ZIPCASTER_INKTANK_SIZE,
		),
		value: roundToNDecimalPlaces((effect * 100) / ZIPCASTER_INKTANK_SIZE),
		modifiedBy: SPECIAL_INK_CONSUMPTION_PER_SECOND_PERCENTAGE_KEY,
	};
}

function specialReticleRadius(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialReticleRadius"] {
	if (
		!hasEffect({
			key: "TargetInCircleRadius",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_RETICLE_RADIUS_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_RETICLE_RADIUS_KEY,
		}),
		key: "TargetInCircleRadius",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(baseEffect),
		value: roundToNDecimalPlaces(effect),
		modifiedBy: SPECIAL_RETICLE_RADIUS_KEY,
	};
}

function specialThrowDistance(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialThrowDistance"] {
	if (
		!hasEffect({
			key: "SpawnSpeedZSpecUp",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_THROW_DISTANCE_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_THROW_DISTANCE_KEY,
		}),
		key: "SpawnSpeedZSpecUp",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(baseEffect),
		value: roundToNDecimalPlaces(effect),
		modifiedBy: SPECIAL_THROW_DISTANCE_KEY,
	};
}

function specialMoveSpeed(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialMoveSpeed"] {
	if (
		!hasEffect({
			key: "MoveSpeed",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_MOVE_SPEED_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_MOVE_SPEED_KEY,
		}),
		key: "MoveSpeed",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(baseEffect, 4),
		value: roundToNDecimalPlaces(effect, 4),
		modifiedBy: SPECIAL_MOVE_SPEED_KEY,
	};
}

function specialAutoChargeRate(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialAutoChargeRate"] {
	if (
		!hasEffect({
			key: "ChargeRateAutoPerFrame",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_AUTO_CHARGE_RATE_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_AUTO_CHARGE_RATE_KEY,
		}),
		key: "ChargeRateAutoPerFrame",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(baseEffect * 100),
		value: roundToNDecimalPlaces(effect * 100),
		modifiedBy: SPECIAL_AUTO_CHARGE_RATE_KEY,
	};
}

function specialMaxRadius(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialMaxRadius"] {
	if (
		!hasEffect({
			key: "MaxRadius",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_MAX_RADIUS_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_MAX_RADIUS_KEY,
		}),
		key: "MaxRadius",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(baseEffect),
		value: roundToNDecimalPlaces(effect),
		modifiedBy: SPECIAL_MAX_RADIUS_KEY,
	};
}

function specialRadiusRangeMax(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialRadiusRangeMax"] {
	if (
		!hasEffect({
			key: "RadiusMax",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_RADIUS_RANGE_KEY = "SPU";

	const radiusMax = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_RADIUS_RANGE_KEY,
		}),
		key: "RadiusMax",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(radiusMax.baseEffect),
		value: roundToNDecimalPlaces(radiusMax.effect),
		modifiedBy: SPECIAL_RADIUS_RANGE_KEY,
	};
}
function specialRadiusRangeMin(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialRadiusRangeMin"] {
	if (
		!hasEffect({
			key: "RadiusMin",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_RADIUS_RANGE_KEY = "SPU";

	const radiusMin = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_RADIUS_RANGE_KEY,
		}),
		key: "RadiusMin",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: roundToNDecimalPlaces(radiusMin.baseEffect),
		value: roundToNDecimalPlaces(radiusMin.effect),
		modifiedBy: SPECIAL_RADIUS_RANGE_KEY,
	};
}

function specialPowerUpDuration(
	args: StatFunctionInput,
): AnalyzedBuild["stats"]["specialPowerUpDuration"] {
	if (
		!hasEffect({
			key: "PowerUpFrame",
			weapon: args.specialWeaponParams,
		})
	) {
		return;
	}

	const SPECIAL_POWER_UP_DURATION_KEY = "SPU";
	const { baseEffect, effect } = abilityPointsToEffects({
		abilityPoints: apFromMap({
			abilityPoints: args.abilityPoints,
			ability: SPECIAL_POWER_UP_DURATION_KEY,
		}),
		key: "PowerUpFrame",
		weapon: args.specialWeaponParams,
	});

	return {
		baseValue: framesToSeconds(baseEffect),
		value: framesToSeconds(effect),
		modifiedBy: SPECIAL_POWER_UP_DURATION_KEY,
	};
}
