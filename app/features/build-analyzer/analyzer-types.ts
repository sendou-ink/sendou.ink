import type {
	Ability,
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";
import type { DAMAGE_TYPE } from "./analyzer-constants";
import type { SPECIAL_EFFECTS } from "./core/specialEffects";
import type { abilityValues } from "./core/utils";
import type { weaponParams } from "./core/weapon-params";

type Overwrites = Record<
	string,
	Partial<Record<"High" | "Mid" | "Low", number>>
>;

export interface MainWeaponParams {
	subWeaponId: SubWeaponId;
	specialWeaponId: SpecialWeaponId;
	/** Replacing default values of the ability json for this specific weapon */
	overwrites?: Overwrites;
	SpecialPoint: number;
	/** Weapon's weight class. "Light/Heavy weapon" */
	WeaponSpeedType?: "Slow" | "Fast";
	/** Total frames it takes the weapon to shoot out three times */
	TripleShotSpanFrame?: number;
	/** Amount of frames charge can be held */
	KeepChargeFullFrame?: number;
	/** Amount of frames full charge takes */
	ChargeFrameFullCharge?: number;
	MoveSpeed?: number;
	MoveSpeed_Charge?: number;
	MoveSpeedFullCharge?: number;
	MoveSpeedVariable?: number;
	DamageParam_ValueMax?: number;
	DamageParam_ValueMin?: number;
	DamageParam_ValueFullChargeMax?: number;
	DamageParam_ValueDirect?: number;
	DamageParam_ValueDirectMax?: number;
	DamageParam_ValueDirectMin?: number;
	// Dread Wringer
	DamageParam_Secondary_ValueDirectMax?: number;
	DamageParam_Secondary_ValueDirectMin?: number;
	DamageParam_SplatanaVerticalDirect?: number;
	DamageParam_SplatanaVertical?: number;
	DamageParam_SplatanaHorizontalDirect?: number;
	DamageParam_SplatanaHorizontal?: number;
	DamageLapOverParam_ValueMax?: number;
	DamageLapOverParam_ValueMin?: number;
	Variable_Damage_ValueMax?: number;
	Variable_Damage_ValueMin?: number;
	BodyParam_Damage?: number;
	SwingUnitGroupParam_DamageParam_DamageMinValue?: number;
	SwingUnitGroupParam_DamageParam_DamageMaxValue?: number;
	VerticalSwingUnitGroupParam_DamageParam_DamageMinValue?: number;
	VerticalSwingUnitGroupParam_DamageParam_DamageMaxValue?: number;
	WideSwingUnitGroupParam_DamageParam_DamageMinValue?: number;
	WideSwingUnitGroupParam_DamageParam_DamageMaxValue?: number;
	Jump_DegSwerve?: number;
	Stand_DegSwerve?: number;
	Variable_Jump_DegSwerve?: number;
	Variable_Stand_DegSwerve?: number;
	/** Damage caused by charger's full charged shot */
	DamageParam_ValueFullCharge?: number;
	/** Max damage caused by charger's charged shot before fully charged */
	DamageParam_ValueMaxCharge?: number;
	/** Charger tap shot damage */
	DamageParam_ValueMinCharge?: number;
	BlastParam_SplashDamage?: number;
	BlastParam_DistanceDamage?: Array<DistanceDamage>;
	// DamageParam_ReduceStartFrame?: number;
	// DamageParam_ReduceEndFrame?: number;
	/** Brella shield HP */
	CanopyHP?: number;
	/** Amount of frames white ink (=no ink recovery during this time) takes */
	InkRecoverStop?: number;
	/** How much ink one shot consumes? InkConsume = 0.5 means 2 shots per full tank */
	InkConsume?: number;
	/** How much ink one slosh of slosher consumes? */
	InkConsumeSlosher?: number;
	/** How much ink one fully charged shot consumes? */
	InkConsumeFullCharge?: number;
	/** How much ink one tap shot consumes? */
	InkConsumeMinCharge?: number;
	/** How much ink one full charge of splatling consumes? */
	InkConsumeFullChargeSplatling?: number;
	/** How much ink one swing of brush consumes? */
	InkConsume_WeaponSwingParam?: number;
	/** How much ink one vertical swing of roller consumes? */
	InkConsume_WeaponVerticalSwingParam?: number;
	/** How much ink one horizontal swing of roller consumes? */
	InkConsume_WeaponWideSwingParam?: number;
	/** How much ink one swing of splatana consumes? */
	InkConsume_SwingParam?: number;
	/** How much ink brella shield launch consumes? */
	InkConsumeUmbrella_WeaponShelterCanopyParam?: number;
	/** How much ink one brella shot consumes? */
	InkConsume_WeaponShelterShotgunParam?: number;
	/** How much ink a dualie dodge roll consumes? */
	InkConsume_SideStepParam?: number;
	/** How much ink a fully charger Splatana shot consumes? */
	InkConsumeFullCharge_ChargeParam?: number;
	//InkConsumeMidCharge_ChargeParam?: number;
	// SpeedInkConsumeMax_WeaponRollParam?: number;
	// SpeedInkConsumeMin_WeaponRollParam?: number;
}

export interface DistanceDamage {
	Damage: number;
	Distance: number;
}

export interface SubWeaponParams {
	overwrites?: Overwrites;
	SubInkSaveLv: 0 | 1 | 2 | 3 | 4;
	/** How much ink one usage of the sub consumes */
	InkConsume: number;
	/** Amount of frames white ink (=no ink recovery during this time) takes */
	InkRecoverStop: number;
	/** Damage dealt at different radiuses */
	DistanceDamage?: Array<DistanceDamage | DistanceDamage[]>;
	/** Damage dealt by explosion at different radiuses (fizzy bomb bounces) */
	DistanceDamage_BlastParamArray?: Array<DistanceDamage | DistanceDamage[]>;
	/** Damage dealt by explosion at different radiuses (torpedo explosion air to ground) */
	DistanceDamage_BlastParamChase?: Array<DistanceDamage>;
	/** Damage dealt by explosion at different radiuses (rolling torpedo) */
	DistanceDamage_SplashBlastParam?: Array<DistanceDamage>;
	/** Damage dealt by direct hit */
	DirectDamage?: number;
}

type SpecialWeaponParamsObject = (typeof weaponParams)["specialWeapons"];
export type SpecialWeaponParams = SpecialWeaponParamsObject[SpecialWeaponId] & {
	overwrites?: Overwrites;
	// no idea why these is not inferred
	WaveDamage?: number;
	ExhaleBlastParamMaxChargeDistanceDamage?: Array<DistanceDamage>;
	ExhaleBlastParamMinChargeDistanceDamage?: Array<DistanceDamage>;
	SwingDamage?: Array<DistanceDamage>;
	ThrowDamage?: Array<DistanceDamage>;
	ThrowDirectDamage?: number;
	BulletDamageMin?: number;
	BulletDamageMax?: number;
	CannonDamage?: Array<DistanceDamage>;
	BumpDamage?: number;
	JumpDamage?: number;
	TickDamage?: number;
};

export type ParamsJson = {
	mainWeapons: Record<MainWeaponId, MainWeaponParams>;
	subWeapons: Record<SubWeaponId, SubWeaponParams>;
	specialWeapons: SpecialWeaponParamsObject;
};

export interface Stat<T = number> {
	value: T;
	baseValue: T;
	modifiedBy: Ability | Array<Ability>;
}

export type AbilityPoints = Map<AbilityWithUnknown, number>;

export type AbilityChunks = Map<AbilityWithUnknown, number>;

export interface StatFunctionInput {
	weaponSplId: MainWeaponId;
	mainWeaponParams: MainWeaponParams;
	subWeaponParams: SubWeaponParams;
	specialWeaponParams: SpecialWeaponParams;
	abilityPoints: AbilityPoints;
	mainOnlyAbilities: Array<Ability>;
	hasTacticooler: boolean;
}

export type InkConsumeType = (typeof INK_CONSUME_TYPES)[number];

export const INK_CONSUME_TYPES = [
	"NORMAL",
	"SWING",
	"SLOSH",
	"VERTICAL_SWING",
	"HORIZONTAL_SWING",
	"TAP_SHOT",
	"FULL_CHARGE",
	"SPLATLING_CHARGE",
	"SHIELD_LAUNCH",
	"DUALIE_ROLL",
] as const;

export interface FullInkTankOption {
	subsUsed: number;
	value: number;
	type: InkConsumeType;
}

export type DamageType = (typeof DAMAGE_TYPE)[number];

export interface Damage {
	value: number;
	type: DamageType;
	distance?: number | [number, number];
	shotsToSplat?: number;
	multiShots?: number;
}

export interface SubWeaponDamage extends Damage {
	baseValue: number;
	subWeaponId: SubWeaponId;
}

export interface AnalyzedBuild {
	weapon: {
		subWeaponSplId: SubWeaponId;
		specialWeaponSplId: SpecialWeaponId;
		brellaCanopyHp?: number;
		maxChargeHoldSeconds?: number;
		fullChargeSeconds?: number;
		speedType: NonNullable<MainWeaponParams["WeaponSpeedType"]> | "Normal";
		multiShots?: number;
	};
	stats: {
		specialPoint: Stat;
		specialLost: Stat;
		specialLostSplattedByRP: Stat;
		mainWeaponWhiteInkSeconds?: number;
		subWeaponWhiteInkSeconds: number;
		subWeaponInkConsumptionPercentage: Stat;
		fullInkTankOptions: Array<FullInkTankOption & { id: string }>;
		damages: Array<Damage & { id: string }>;
		specialWeaponDamages: Array<Damage & { id: string }>;
		subWeaponDefenseDamages: Array<SubWeaponDamage & { id: string }>;
		squidFormInkRecoverySeconds: Stat;
		humanoidFormInkRecoverySeconds: Stat;
		runSpeed: Stat;
		shootingRunSpeed?: Stat;
		shootingRunSpeedCharging?: Stat;
		shootingRunSpeedFullCharge?: Stat;
		shootingRunSpeedSecondaryMode?: Stat;
		swimSpeed: Stat;
		swimSpeedHoldingRainmaker: Stat;
		runSpeedInEnemyInk: Stat;
		framesBeforeTakingDamageInEnemyInk: Stat;
		damageTakenInEnemyInkPerSecond: Stat;
		enemyInkDamageLimit: Stat;
		quickRespawnTime: Stat;
		quickRespawnTimeSplattedByRP: Stat;
		superJumpTimeGroundFrames: Stat;
		superJumpTimeTotal: Stat;
		shotSpreadAir?: Stat;
		shotSpreadGround?: number;
		shotAutofireSpreadAir?: Stat;
		shotAutofireSpreadGround?: number;
		squidSurgeChargeFrames: Stat;

		subDefPointSensorMarkedTimeInSeconds: Stat;
		subDefInkMineMarkedTimeInSeconds: Stat;
		subDefAngleShooterMarkedTimeInSeconds: Stat;
		subDefToxicMistMovementReduction: Stat;

		subVelocity?: Stat;
		subFirstPhaseDuration?: Stat;
		subSecondPhaseDuration?: Stat;
		subMarkingTimeInSeconds?: Stat;
		subMarkingRadius?: Stat;
		subExplosionRadius?: Stat;
		subHp?: Stat;
		subQsjBoost?: Stat;

		specialDurationInSeconds?: Stat;
		specialDamageDistance?: Stat;
		specialPaintRadius?: Stat;
		specialFieldHp?: Stat;
		specialDeviceHp?: Stat;
		specialHookInkConsumptionPercentage?: Stat;
		specialInkConsumptionPerSecondPercentage?: Stat;
		specialReticleRadius?: Stat;
		specialThrowDistance?: Stat;
		specialMoveSpeed?: Stat;
		specialAutoChargeRate?: Stat;
		specialMaxRadius?: Stat;
		specialRadiusRangeMin?: Stat;
		specialRadiusRangeMax?: Stat;
		specialPowerUpDuration?: Stat;
	};
}

export type SpecialEffectType = (typeof SPECIAL_EFFECTS)[number]["type"];

export type AbilityValuesKeys = keyof typeof abilityValues;

export type AnyWeapon =
	| { type: "MAIN"; id: MainWeaponId }
	| { type: "SUB"; id: SubWeaponId }
	| { type: "SPECIAL"; id: SpecialWeaponId };
