// To run this script drop the https://github.com/Leanny/splat3 repo into scripts/dicts/splat3

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as v from "valibot";
import type {
	BaseWeaponStats,
	MainWeaponParams,
	ParamsJson,
	SubWeaponParams,
	WeaponKit,
} from "~/features/build-analyzer/analyzer-types";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	SQUID_BEAKON_ID,
	subWeaponIds,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import {
	LANG_JSONS_TO_CREATE,
	loadLangDicts,
	loadSplPlayerParams,
	loadWeaponInfoMain,
	loadWeaponInfoSpecial,
	loadWeaponInfoSub,
	translationJsonFolderName,
	weaponParamsDir,
} from "./utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const playersParams = loadSplPlayerParams();
const weapons = loadWeaponInfoMain();
const subWeapons = loadWeaponInfoSub();
const specialWeapons = loadWeaponInfoSpecial();

const CURRENT_SEASON = 9;

type MainWeapon = (typeof weapons)[number];
type SubWeapon = (typeof subWeapons)[number];
type SpecialWeapon = (typeof specialWeapons)[number];
type TranslationArray = Array<{ language: string; key: string; value: string }>;

const KIT_PROPERTIES = [
	"SpecialPoint",
	"subWeaponId",
	"specialWeaponId",
] as const;

async function main() {
	const allMainWeaponParams: Record<number, MainWeaponParams> = {};
	const subWeaponsResult: Record<number, SubWeaponParams> = {};
	const specialWeaponsResult: any = {};
	const translations: TranslationArray = [];

	const langDicts = await loadLangDicts();
	const hasLangDicts = langDicts.length > 0;

	for (const weapon of weapons) {
		if (mainWeaponShouldBeSkipped(weapon)) continue;

		const rawParams = loadWeaponParamsObject(weapon);
		const params = combineSwingsIfSame(
			parametersToMainWeaponResult(weapon, rawParams),
		);

		if (hasLangDicts) {
			translationsToArray({
				arr: translations,
				internalName: weapon.__RowId,
				weaponId: weapon.Id,
				type: "Main",
				translations: langDicts,
			});
		}

		allMainWeaponParams[weapon.Id] = params;
	}

	const { baseWeaponStats, weaponKits } =
		splitIntoBaseStatsAndKits(allMainWeaponParams);

	for (const subWeapon of subWeapons) {
		if (subWeaponShouldBeSkipped(subWeapon)) continue;

		const rawParams = loadWeaponParamsObject(subWeapon);
		const params = parametersToSubWeaponResult(subWeapon, rawParams);

		if (hasLangDicts) {
			translationsToArray({
				arr: translations,
				internalName: subWeapon.__RowId,
				weaponId: subWeapon.Id,
				type: "Sub",
				translations: langDicts,
			});
		}

		subWeaponsResult[subWeapon.Id] = params;
	}

	for (const specialWeapon of specialWeapons) {
		if (specialWeaponShouldBeSkipped(specialWeapon)) continue;

		const rawParams = loadWeaponParamsObject(specialWeapon);
		const params: Record<string, any> =
			parametersToSpecialWeaponResult(rawParams);

		// Super Chumps has two distinct splash damage values (near/far)
		// that should be labeled separately in the analyzer
		const SUPER_CHUMP_SPECIAL_ID = 16;
		if (
			specialWeapon.Id === SUPER_CHUMP_SPECIAL_ID &&
			params.DistanceDamage?.length === 2
		) {
			const sorted = [...params.DistanceDamage].sort(
				(a: any, b: any) => b.Damage - a.Damage,
			);
			params.SplashDamageMax = [sorted[0]];
			params.SplashDamageMin = [sorted[1]];
			params.DistanceDamage = undefined;
		}

		Object.assign(params, specialWeaponRangeParams(specialWeapon, rawParams));

		if (hasLangDicts) {
			translationsToArray({
				arr: translations,
				internalName: specialWeapon.__RowId,
				weaponId: specialWeapon.Id,
				type: "Special",
				translations: langDicts,
			});
		}

		specialWeaponsResult[specialWeapon.Id] = params;
	}

	const toFile: ParamsJson = {
		baseWeaponStats,
		weaponKits,
		subWeapons: subWeaponsResult,
		specialWeapons: specialWeaponsResult,
	};

	const weaponParamsTs = `export const weaponParams = ${JSON.stringify(toFile, null, "\t")} as const;\n`;

	fs.writeFileSync(
		path.join(
			__dirname,
			"..",
			"app",
			"features",
			"build-analyzer",
			"data",
			"weapon-params.ts",
		),
		weaponParamsTs,
	);

	if (hasLangDicts) {
		writeTranslationsJsons(translations);
	}
	logWeaponIds(weaponKits);
}

function splitIntoBaseStatsAndKits(
	allParams: Record<number, MainWeaponParams>,
): {
	baseWeaponStats: Record<number, BaseWeaponStats>;
	weaponKits: Record<number, WeaponKit>;
} {
	const weaponGroups: Record<
		number,
		Array<{ id: number; params: MainWeaponParams }>
	> = {};

	for (const [idStr, params] of Object.entries(allParams)) {
		const id = Number(idStr) as MainWeaponId;
		const baseId = weaponIdToBaseWeaponId(id);
		if (!weaponGroups[baseId]) weaponGroups[baseId] = [];
		weaponGroups[baseId].push({ id, params });
	}

	const baseWeaponStats: Record<number, BaseWeaponStats> = {};
	const weaponKits: Record<number, WeaponKit> = {};

	for (const [baseIdStr, variants] of Object.entries(weaponGroups)) {
		const baseId = Number(baseIdStr);
		const firstVariant = variants[0].params;

		const nonKitProps = Object.keys(firstVariant).filter(
			(k) => !KIT_PROPERTIES.includes(k as (typeof KIT_PROPERTIES)[number]),
		) as Array<keyof MainWeaponParams>;

		const sharedProps: Partial<MainWeaponParams> = {};
		for (const prop of nonKitProps) {
			const firstVal = JSON.stringify(firstVariant[prop]);
			const allSame = variants.every(
				(variant) => JSON.stringify(variant.params[prop]) === firstVal,
			);
			if (allSame && firstVariant[prop] !== undefined) {
				(sharedProps as any)[prop] = firstVariant[prop];
			}
		}

		baseWeaponStats[baseId] = sharedProps;

		for (const variant of variants) {
			const kit: WeaponKit = {
				SpecialPoint: variant.params.SpecialPoint,
				subWeaponId: variant.params.subWeaponId,
				specialWeaponId: variant.params.specialWeaponId,
			};

			for (const prop of nonKitProps) {
				if (!(prop in sharedProps) && variant.params[prop] !== undefined) {
					(kit as any)[prop] = variant.params[prop];
				}
			}

			weaponKits[variant.id] = kit;
		}
	}

	return { baseWeaponStats, weaponKits };
}

const WEAPON_CATEGORY_RANGES = [
	{ name: "SHOOTERS", range: [0, 199] },
	{ name: "BLASTERS", range: [200, 299] },
	{ name: "SHOOTERS", range: [300, 499] },
	{ name: "ROLLERS", range: [1000, 1099] },
	{ name: "BRUSHES", range: [1100, 1199] },
	{ name: "CHARGERS", range: [2000, 2099] },
	{ name: "SLOSHERS", range: [3000, 3099] },
	{ name: "SPLATLINGS", range: [4000, 4099] },
	{ name: "DUALIES", range: [5000, 5099] },
	{ name: "BRELLAS", range: [6000, 6099] },
	{ name: "STRINGERS", range: [7000, 7099] },
	{ name: "SPLATANAS", range: [8000, 8099] },
] as const;

type WeaponCategoryName = (typeof WEAPON_CATEGORY_RANGES)[number]["name"];

function getWeaponCategoryName(
	weaponId: number,
): WeaponCategoryName | undefined {
	for (const category of WEAPON_CATEGORY_RANGES) {
		if (weaponId >= category.range[0] && weaponId <= category.range[1]) {
			return category.name;
		}
	}
	return undefined;
}

const BLOBLOBBER_IDS: number[] = [3030, 3031];
const BALLPOINT_SPLATLING_IDS: number[] = [4030, 4031];
const REEF_LUX_IDS: number[] = [7020, 7021, 7022];
const DREAD_WRINGER_IDS: number[] = [3050, 3051, 3052];
const SLOSHING_MACHINE_IDS: number[] = [3020, 3021];
const DEFAULT_CANOPY_HP_BRELLA_IDS: number[] = [6000, 6001, 6005];

const SPLATLING_WEAPON_PARAM_TYPE = "spl__WeaponSpinnerParam";
const SLOSHER_WEAPON_PARAM_TYPE = "spl__WeaponSlosherParam";

type RangeParamsExtractor = (
	weapon: MainWeapon,
	params: any,
) => Partial<MainWeaponParams>;

const RANGE_PARAMS_BY_CATEGORY: Record<
	WeaponCategoryName,
	RangeParamsExtractor
> = {
	SHOOTERS: shotRangeParams,
	BLASTERS: shotRangeParams,
	ROLLERS: rollerRangeParams,
	BRUSHES: brushRangeParams,
	CHARGERS: shotRangeParams,
	SLOSHERS: slosherRangeParams,
	SPLATLINGS: splatlingRangeParams,
	DUALIES: shotRangeParams,
	BRELLAS: brellaRangeParams,
	STRINGERS: stringerRangeParams,
	SPLATANAS: splatanaRangeParams,
};

function extractRangeParams(weapon: MainWeapon, params: any) {
	const category = getWeaponCategoryName(weapon.Id);

	if (!category) {
		return {};
	}

	const isCharger = params.MoveParam?.$type === "spl__BulletChargerMoveParam";

	if (isCharger) {
		return {
			DistanceFullCharge: params.MoveParam?.DistanceFullCharge,
			DistanceMaxCharge: params.MoveParam?.DistanceMaxCharge,
			DistanceMinCharge: params.MoveParam?.DistanceMinCharge,
		};
	}

	return RANGE_PARAMS_BY_CATEGORY[category](weapon, params);
}

/** Param paths are dot-separated keys read with optional chaining, e.g. "UnitGroupParam.Unit.0". */
type MainWeaponParamResolver =
	readonly string[] | ((params: any, weapon: MainWeapon) => unknown);

const MAIN_WEAPON_SPEED_AND_DAMAGE_PARAMS: Record<
	string,
	MainWeaponParamResolver
> = {
	TripleShotSpanFrame: ["WeaponParam.TripleShotSpanFrame"],
	WeaponSpeedType: weaponSpeedType,
	MoveSpeed: [
		"WeaponParam.MoveSpeed",
		"spl__WeaponShelterShotgunParam.MoveSpeed",
	],
	MoveSpeed_Charge: moveSpeedCharge,
	MoveSpeedFullCharge: [
		"WeaponParam.MoveSpeedFullCharge",
		"spl__WeaponStringerParam.ChargeParam.MoveSpeedFullCharge",
	],
	MoveSpeedVariable: [
		"VariableWeaponParam.MoveSpeed",
		"VariableShotParam.MoveSpeed",
	],
	DamageParam_ValueMax: damageValueMax,
	DamageParam_ValueMin: damageValueMin,
	DamageParam_ValueDirect: directDamageValue,
};

const MAIN_WEAPON_OTHER_PARAMS: Record<string, MainWeaponParamResolver> = {
	// Glooga turret mode damage
	DamageLapOverParam_ValueMax: ["DamageLapOverParam.ValueMax"],
	DamageLapOverParam_ValueMin: ["DamageLapOverParam.ValueMin"],
	BlastParam_SplashDamage: sloshingMachineSplashDamage,
	BlastParam_DistanceDamage: blastDistanceDamage,
	BlastJumpParam_DistanceDamage: ["BlastJumpParam.DistanceDamage"],
	DamageParam_ValueFullCharge: ["DamageParam.ValueFullCharge"],
	DamageParam_ValueFullChargeMax: fullChargeMaxDamage,
	DamageParam_ValueMaxCharge: ["DamageParam.ValueMaxCharge"],
	DamageParam_ValueMinCharge: ["DamageParam.ValueMinCharge"],
	DamageParam_SplatanaVerticalDirect: [
		"BulletSaberSlashVerticalParam.DamageParam.DamageValue",
	],
	DamageParam_SplatanaVertical: [
		"BulletSaberVerticalParam.DamageParam.HitDamage",
	],
	DamageParam_SplatanaHorizontalDirect: splatanaHorizontalDirectDamage,
	DamageParam_SplatanaHorizontal: [
		"BulletSaberHorizontalParam.DamageParam.HitDamage",
	],
	BodyParam_Damage: ["BodyParam.Damage"],
	Variable_Damage_ValueMax: ["VariableDamageParam.ValueMax"],
	Variable_Damage_ValueMin: ["VariableDamageParam.ValueMin"],
	SwingUnitGroupParam_DamageParam_DamageMinValue: swingSplashDamage(
		"SwingUnitGroupParam",
		"Min",
	),
	SwingUnitGroupParam_DamageParam_DamageMaxValue: swingSplashDamage(
		"SwingUnitGroupParam",
		"Max",
	),
	// roller splash damages
	VerticalSwingUnitGroupParam_DamageParam_DamageMinValue: swingSplashDamage(
		"VerticalSwingUnitGroupParam",
		"Min",
	),
	VerticalSwingUnitGroupParam_DamageParam_DamageMaxValue: swingSplashDamage(
		"VerticalSwingUnitGroupParam",
		"Max",
	),
	WideSwingUnitGroupParam_DamageParam_DamageMinValue: swingSplashDamage(
		"WideSwingUnitGroupParam",
		"Min",
	),
	WideSwingUnitGroupParam_DamageParam_DamageMaxValue: swingSplashDamage(
		"WideSwingUnitGroupParam",
		"Max",
	),
	CanopyHP: canopyHp,
	ChargeFrameFullCharge: [
		"WeaponParam.ChargeFrameFullCharge",
		"spl__WeaponStringerParam.ChargeParam.ChargeFrameFullCharge",
	],
	KeepChargeFullFrame: keepChargeFullFrame,
	Jump_DegSwerve: ["WeaponParam.Jump_DegSwerve"],
	Stand_DegSwerve: ["WeaponParam.Stand_DegSwerve"],
	Variable_Jump_DegSwerve: [
		"VariableWeaponParam.Jump_DegSwerve",
		"VariableShotParam.Jump_DegSwerve",
	],
	Variable_Stand_DegSwerve: [
		"VariableWeaponParam.Stand_DegSwerve",
		"VariableShotParam.Stand_DegSwerve",
	],
	InkRecoverStop: [
		"WeaponParam.InkRecoverStop",
		"WeaponSwingParam.InkRecoverStop",
		"spl__WeaponSaberParam.SwingParam.InkRecoverStop",
		"spl__WeaponShelterShotgunParam.InkRecoverStop",
	],
	InkRecoverStop_WeaponVerticalSwingParam: [
		"WeaponVerticalSwingParam.InkRecoverStop",
	],
	InkRecoverStop_WeaponWideSwingParam: ["WeaponWideSwingParam.InkRecoverStop"],
	InkConsume: defaultInkConsume,
	InkConsumeVariable: ["VariableWeaponParam.InkConsume"],
	InkConsumeSlosher: slosherInkConsume,
	InkConsumeFullCharge: ["WeaponParam.InkConsumeFullCharge"],
	InkConsumeMinCharge: [
		"WeaponParam.InkConsumeMinCharge",
		"spl__WeaponStringerParam.ChargeParam.InkConsumeMinCharge",
	],
	InkConsumeFullChargeSplatling: splatlingInkConsume,
	InkConsume_WeaponSwingParam: ["WeaponSwingParam.InkConsume"],
	InkConsume_WeaponVerticalSwingParam: ["WeaponVerticalSwingParam.InkConsume"],
	InkConsume_WeaponWideSwingParam: ["WeaponWideSwingParam.InkConsume"],
	InkConsumeUmbrella_WeaponShelterCanopyParam: brellaShieldInkConsume,
	InkConsume_WeaponShelterShotgunParam: [
		"spl__WeaponShelterShotgunParam.InkConsume",
	],
	InkConsume_SideStepParam: ["SideStepParam.InkConsume"],
	InkConsumeMaxPerFrame_WeaponRollParam: [
		"WeaponRollParam.InkConsumeMaxPerFrame",
	],
	InkConsume_SwingParam: ["spl__WeaponSaberParam.SwingParam.InkConsume"],
	InkConsumeFullCharge_ChargeParam: [
		"spl__WeaponSaberParam.ChargeParam.InkConsumeFullCharge",
		"spl__WeaponStringerParam.ChargeParam.InkConsumeFullCharge",
	],
};

function parametersToMainWeaponResult(
	weapon: MainWeapon,
	params: any,
): MainWeaponParams {
	const rangeParams = extractRangeParams(weapon, params);

	return {
		SpecialPoint: weapon.SpecialPoint,
		subWeaponId: resolveSubWeaponId(weapon),
		specialWeaponId: resolveSpecialWeaponId(weapon),
		overwrites: resolveOverwrites(params),
		...rangeParams,
		...resolveMainWeaponParams(
			weapon,
			params,
			MAIN_WEAPON_SPEED_AND_DAMAGE_PARAMS,
		),
		...slosherDirectDamage(params),
		...slosherDirectDamageSecondary(weapon, params),
		...resolveMainWeaponParams(weapon, params, MAIN_WEAPON_OTHER_PARAMS),
	};
}

function combineSwingsIfSame(params: MainWeaponParams): MainWeaponParams {
	if (
		!params.InkConsume_WeaponVerticalSwingParam ||
		params.InkConsume_WeaponVerticalSwingParam !==
			params.InkConsume_WeaponWideSwingParam
	) {
		return params;
	}

	return {
		...params,
		InkConsume_WeaponSwingParam: params.InkConsume_WeaponVerticalSwingParam,
		InkConsume_WeaponVerticalSwingParam: undefined,
		InkConsume_WeaponWideSwingParam: undefined,
	};
}

function parametersToSubWeaponResult(
	subWeapon: SubWeapon,
	params: any,
): SubWeaponParams {
	const SubInkSaveLv = params.SubWeaponSetting?.SubInkSaveLv ?? 2;

	return {
		overwrites: resolveSubWeaponOverwrites(subWeapon, params),
		SubInkSaveLv,
		InkConsume: params.WeaponParam.InkConsume ?? 0.7,
		InkRecoverStop: params.WeaponParam.InkRecoverStop,
		DistanceDamage: params.BlastParamMaxCharge?.DistanceDamage
			? // curling bomb difference charge to same key
				[
					params.BlastParamMaxCharge.DistanceDamage,
					params.BlastParamMinCharge?.DistanceDamage,
				]
			: params.BlastParam?.DistanceDamage,
		DirectDamage:
			params.MoveParam?.DirectDamage ?? params.MoveParam?.DamageDirectHit,
		DistanceDamage_BlastParamArray: params.MoveParam?.BlastParamArray?.map(
			(b: any) => b.DistanceDamage,
		),
		DistanceDamage_BlastParamChase: params.BlastParamChase?.DistanceDamage,
		DistanceDamage_SplashBlastParam:
			params.BlastParamChase?.SplashBlastParam?.DistanceDamage,
	};
}

// Thrown targeting specials (Booyah Bomb, Super Chump, Triple Inkstrike, Ultra Stamp) are player-aimed
// with no throw-distance param, so their fly range is a per-special constant, all Booyah Bomb's value for now.
const BOOYAH_BOMB_FLY_DISTANCE = 27;
const SUPER_CHUMP_FLY_DISTANCE = 30;
const TRIPLE_INKSTRIKE_FLY_DISTANCE = 28;
const ULTRA_STAMP_FLY_DISTANCE = 24;

// Range circles for the map planner (see app/features/comp-analyzer/core/SpecialWeaponRange.ts):
// travel distance plus blast, or a single effect radius. Global (Tenta Missiles, Killer Wail), placed/utility
// (Big Bubbler, Tacticooler, Ink Storm, Ink Vac) and circle-less (Kraken Royale, Splattercolor Screen) specials are left out.
function specialWeaponRangeParams(
	specialWeapon: SpecialWeapon,
	rawParams: any,
): Record<string, number | undefined> {
	const outerBlastDistance = (blastParam: any): number | undefined =>
		blastParam?.DistanceDamage?.at(-1)?.Distance;

	const trajectoryFromMoveParam = (moveParam: any) => ({
		Range_SpawnSpeed: moveParam?.SpawnSpeed,
		Range_GoStraightStateEndMaxSpeed: moveParam?.GoStraightStateEndMaxSpeed,
		Range_GoStraightToBrakeStateFrame: moveParam?.GoStraightToBrakeStateFrame,
		Range_FreeGravity: moveParam?.FreeGravity,
		Range_FreeAirResist: moveParam?.FreeAirResist,
		Range_BrakeAirResist: moveParam?.BrakeAirResist,
		Range_BrakeGravity: moveParam?.BrakeGravity,
		Range_BrakeToFreeStateFrame: moveParam?.BrakeToFreeStateFrame,
	});

	switch (specialWeapon.__RowId) {
		case "SpUltraShot": // Trizooka
			return {
				...trajectoryFromMoveParam(rawParams.MoveParam),
				Range_BlastRadius: outerBlastDistance(rawParams.BlastParam),
			};
		case "SpJetpack": // Inkjet (shot flies straight for a fixed distance)
			return {
				Range_Distance: rawParams.MoveParam?.Distance,
				Range_BlastRadius: outerBlastDistance(rawParams.BlastParam),
			};
		case "SpChariot": // Crab Tank (rapid gun reach)
			return {
				...trajectoryFromMoveParam(rawParams.ShooterMoveParam),
				Range_BlastRadius: outerBlastDistance(
					rawParams.CannonParam?.BlastParam,
				),
			};
		case "SpNiceBall": // Booyah Bomb (thrown, then bursts on impact)
			return {
				Range_Distance: BOOYAH_BOMB_FLY_DISTANCE,
				Range_BlastRadius: rawParams.BlastParam?.DamageRadiusEnd,
			};
		case "SpFirework": // Super Chump (thrown, chumps burst on impact)
			return {
				Range_Distance: SUPER_CHUMP_FLY_DISTANCE,
				Range_BlastRadius: outerBlastDistance(rawParams.IceParam?.BlastParam),
			};
		case "SpTripleTornado": // Triple Inkstrike (thrown beacons, strikes burst)
			return {
				Range_Distance: TRIPLE_INKSTRIKE_FLY_DISTANCE,
				Range_BlastRadius: rawParams.BlastParam?.DamageRadiusEnd,
			};
		case "SpUltraStamp": // Ultra Stamp (thrown stamp bursts on impact)
			return {
				Range_Distance: ULTRA_STAMP_FLY_DISTANCE,
				Range_BlastRadius: outerBlastDistance(rawParams.ThrowBlastParam),
			};
		case "SpSuperHook": // Zipcaster (grapple reach)
			return { Range_Radius: rawParams.WeaponParam?.MaxLengthHook };
		case "SpShockSonar": // Wave Breaker (tracking wave max radius, base Special Power Up)
			return {
				Range_Radius:
					rawParams.spl__BulletSpShockSonarParam?.WaveParam?.MaxRadius?.Low,
			};
		case "SpSkewer": // Reefslider (lethal blast)
			return {
				Range_Radius: rawParams.BulletBlastParam?.DistanceDamage?.[0]?.Distance,
			};
		case "SpPogo": // Triple Splashdown (lethal blast, per splashdown)
			return {
				Range_Radius: rawParams.BlastParamNormal?.DistanceDamage?.[0]?.Distance,
			};
		default:
			return {};
	}
}

const SPECIAL_DISTANCE_DAMAGE_PARAM_PATHS = [
	"BlastParam.DistanceDamage",
	"HookBlastParam.DistanceDamage",
	"spl__BulletBlastParam.DistanceDamage",
	"BulletBlastParam.DistanceDamage",
	"IceParam.BlastParam.DistanceDamage",
	"BlastParamNormal.DistanceDamage",
];

// some specials lack damage values in the params, so they are hardcoded here
function parametersToSpecialWeaponResult(params: any) {
	return {
		ArmorHP: params.WeaponSpChariotParam?.ArmorHP,
		overwrites: resolveSpecialWeaponOverwrites(params),
		DistanceDamage: firstDefinedParam(
			params,
			SPECIAL_DISTANCE_DAMAGE_PARAM_PATHS,
		),
		DirectDamage: specialDirectDamage(params),
		WaveDamage: params.spl__BulletSpShockSonarParam?.WaveParam?.Damage,
		ExhaleBlastParamMinChargeDistanceDamage:
			params.ExhaleBlastParamMinCharge?.DistanceDamage,
		ExhaleBlastParamMaxChargeDistanceDamage:
			params.ExhaleBlastParamMaxCharge?.DistanceDamage,
		InhaleDamage: params.InhaleParam?.DamagePerFrameByObject,
		SwingDamage: ultraStampSwingDamage(params),
		ThrowDamage: ultraStampThrowDamage(params),
		ThrowDirectDamage: params.ThrowMoveParam?.DirectDamageValue,
		BulletDamageMin: params.ShooterDamageParam?.ValueMin,
		BulletDamageMax: params.ShooterDamageParam?.ValueMax,
		CannonDamage: crabTankCannonDamage(params),
		BumpDamage: specialBumpDamage(params),
		JumpDamage: params.BodyParam?.DamageJumpValue,
		TickDamage: specialTickDamage(params),
	};
}

function unwrapSubSpecialSpecUpList(result: any) {
	return Object.fromEntries(
		Object.entries(result).flatMap((entries) => {
			const [key, value]: any = entries;
			if (Array.isArray(value)) {
				return value.map((entry: any) => {
					if (
						entry.Value.Low === entry.Value.Mid &&
						entry.Value.Mid === entry.Value.High
					) {
						return [];
					}

					// datamine omits SpecUpType when it's the enum default
					return [entry.SpecUpType ?? "PaintRadius", entry.Value];
				});
			}

			return [[key, value]];
		}),
	);
}

function resolveSubWeaponId(weapon: MainWeapon) {
	const codeName = weapon.SubWeapon.replace("Work/Gyml/", "").replace(
		".spl__WeaponInfoSub.gyml",
		"",
	);

	const subWeaponObj = subWeapons.find((wpn) => codeName === wpn.__RowId);
	invariant(subWeaponObj, `Could not find sub weapon for '${weapon.__RowId}'`);
	invariant(
		subWeaponIds.includes(subWeaponObj.Id as any),
		"Invalid sub weapon id",
	);

	return subWeaponObj.Id as SubWeaponId;
}

function resolveSpecialWeaponId(weapon: MainWeapon) {
	const codeName = weapon.SpecialWeapon.replace("Work/Gyml/", "").replace(
		".spl__WeaponInfoSpecial.gyml",
		"",
	);

	const specialWeaponObj = specialWeapons.find(
		(wpn) => codeName === wpn.__RowId,
	);
	invariant(
		specialWeaponObj,
		`Could not find special weapon for '${codeName}'`,
	);

	return specialWeaponObj.Id as SpecialWeaponId;
}

const overwriteSchema = v.object({
	High: v.optional(v.number()),
	Mid: v.optional(v.number()),
	Low: v.optional(v.number()),
});

function resolveOverwrites(params: any) {
	const result: MainWeaponParams["overwrites"] = {};

	for (const [key, value] of Object.entries(params)) {
		const parsed = v.safeParse(overwriteSchema, value);

		resolveOverwritesWithArbitraryKeys(result, value);

		// each object has a $type property which we ignore
		if (
			key.includes("PlayerGearSkillParam") &&
			parsed.success &&
			Object.keys(parsed).length > 1
		) {
			const abilityKey = key.split("_").at(-1);
			invariant(abilityKey, `Could not find ability key for '${key}'`);

			if (!parsed.output.High && !parsed.output.Mid && !parsed.output.Low) {
				continue;
			}

			result[abilityKey] = {
				High: parsed.output.High,
				Mid: parsed.output.Mid,
				Low: parsed.output.Low,
			};
		}
	}

	if (Object.keys(result).length === 0) return;

	return result;
}

function resolveOverwritesWithArbitraryKeys(
	result: NonNullable<MainWeaponParams["overwrites"]>,
	paramsObj: unknown,
) {
	for (const [key, value] of Object.entries(
		paramsObj as Record<string, number>,
	)) {
		if (!key.startsWith("Overwrite_")) continue;
		if (value === -1) continue;

		let abilityKey = key.replace("Overwrite_", "");

		for (const type of ["High", "Mid", "Low"] as const) {
			const suffix = `_${type}`;
			if (!abilityKey.endsWith(suffix)) continue;

			abilityKey = abilityKey.replace(suffix, "");

			if (!result[abilityKey]) result[abilityKey] = {};

			result[abilityKey][type] = value;
		}
	}
}

function resolveSubWeaponOverwrites(subWeapon: SubWeapon, params: any) {
	const result: SubWeaponParams["overwrites"] = {
		SpawnSpeedZSpecUp: params.MoveParam?.SpawnSpeedZSpecUp,
		PeriodFirst: params.MoveParam?.PeriodFirst,
		PeriodSecond: params.MoveParam?.PeriodSecond,
		MarkingFrameSubSpec:
			params.MoveParam?.MarkingFrameSubSpec ??
			params.MoveParam?.MarkingFrame ??
			params.AreaParam?.MarkingFrameSubSpec,
		SensorRadius: params.MoveParam?.SensorRadius,
		ExplosionRadius: params.AreaParam?.Distance,
		MaxHP: params.MoveParam?.MaxHP,
		SubSpecUpParam: (subWeapon.Id === SQUID_BEAKON_ID
			? {
					Low: 0.0,
					...playersParams.GameParameters.spl__PlayerBeaconSubSpecUpParam
						.SubSpecUpParam,
				}
			: undefined) as any,
	};

	return Object.fromEntries(
		Object.entries(result).filter(
			([_key, value]) =>
				value && (value.High !== value.Mid || value.Low !== value.High),
		),
	);
}

const WEAPON_TYPES_TO_IGNORE = [
	"Mission",
	"Coop",
	"Hero",
	"Rival",
	"SalmonBuddy",
	"Sdodr",
];

const INTERNAL_WEAPON_NAMES_TO_IGNORE: readonly string[] = ["Free"] as const;
function mainWeaponShouldBeSkipped(mainWeapon: MainWeapon) {
	if (
		WEAPON_TYPES_TO_IGNORE.includes(mainWeapon.Type) ||
		INTERNAL_WEAPON_NAMES_TO_IGNORE.includes(mainWeapon.__RowId) ||
		mainWeapon.Season > CURRENT_SEASON
	) {
		return true;
	}

	return false;
}

function subWeaponShouldBeSkipped(subWeapon: SubWeapon) {
	if (subWeapon.Id === 10000) return true;
	if (WEAPON_TYPES_TO_IGNORE.some((val) => subWeapon.__RowId.includes(val))) {
		return true;
	}

	return false;
}

function specialWeaponShouldBeSkipped(specialWeapon: SpecialWeapon) {
	if (
		WEAPON_TYPES_TO_IGNORE.some((val) => specialWeapon.Type.includes(val)) ||
		WEAPON_TYPES_TO_IGNORE.some((val) => specialWeapon.__RowId.includes(val))
	) {
		return true;
	}
	if (specialWeapon.__RowId === "SpGachihoko") return true;
	if (specialWeapon.__RowId === "SpGachihokoForEventMatch") return true;

	return false;
}

function loadWeaponParamsObject(
	weapon: MainWeapon | SubWeapon | SpecialWeapon,
) {
	return JSON.parse(
		fs.readFileSync(
			path.join(weaponParamsDir(), weaponRowIdToFileName(weapon)),
			"utf8",
		),
	).GameParameters;
}

function weaponRowIdToFileName(weapon: MainWeapon | SubWeapon | SpecialWeapon) {
	const [category, codeName] = weapon.__RowId.split("_");
	invariant(category);

	return `Weapon${category}${codeName ?? ""}.game__GameParameterTable.json`;
}

function translationsToArray({
	arr,
	internalName,
	weaponId,
	type,
	translations,
}: {
	arr: TranslationArray;
	internalName: string;
	weaponId: number;
	type: "Main" | "Sub" | "Special";
	translations: [
		langCode: string,
		translations: Record<string, Record<string, string>>,
	][];
}) {
	for (const langCode of LANG_JSONS_TO_CREATE) {
		const translationOfLanguage = translations.find((t) => t[0] === langCode);
		invariant(
			translationOfLanguage,
			`Could not find translation for '${langCode}'`,
		);

		const value =
			translationOfLanguage[1][`CommonMsg/Weapon/WeaponName_${type}`]?.[
				internalName
			];
		invariant(value, `Could not find translation for '${internalName}'`);

		arr.push({
			key: `${type.toUpperCase()}_${weaponId}`,
			language: langCode,
			value,
		});
	}
}

function writeTranslationsJsons(arr: TranslationArray) {
	for (const langCode of LANG_JSONS_TO_CREATE) {
		fs.writeFileSync(
			path.join(
				__dirname,
				"..",
				"locales",
				translationJsonFolderName(langCode),
				"weapons.json",
			),
			`${JSON.stringify(
				Object.fromEntries(
					arr
						.filter((val) => val.language === langCode)
						.map(({ key, value }) => [key, value]),
				),
				null,
				"\t",
			)}\n`,
		);
	}
}

function logWeaponIds(weaponKits: Record<number, WeaponKit>) {
	logger.info(JSON.stringify(Object.keys(weaponKits).map(Number)));
}

function shotRangeParams(_weapon: MainWeapon, params: any) {
	return projectileRangeParams(params, params.MoveParam);
}

function brellaRangeParams(_weapon: MainWeapon, params: any) {
	return projectileRangeParams(
		params,
		params.spl__BulletShelterShotgunParam?.GroupParams?.[0]?.MoveParam,
	);
}

function projectileRangeParams(params: any, moveParam: any) {
	const isBlaster = params.BlastParam?.DistanceDamage !== undefined;
	const blastRadius = isBlaster
		? params.BlastParam?.DistanceDamage?.[1]?.Distance
		: undefined;

	return {
		Range_SpawnSpeed: moveParam?.SpawnSpeed,
		Range_GoStraightStateEndMaxSpeed: moveParam?.GoStraightStateEndMaxSpeed,
		Range_GoStraightToBrakeStateFrame: moveParam?.GoStraightToBrakeStateFrame,
		Range_FreeGravity: moveParam?.FreeGravity,
		Range_ZRate: params.spl__SpawnBulletAdditionMovePlayerParam?.ZRate,
		BlastRadius: blastRadius,
	};
}

function slosherRangeParams(weapon: MainWeapon, params: any) {
	const units = params.UnitGroupParam?.Unit;
	const unitForRange = units?.reduce(
		(best: any, unit: any) =>
			(unit?.SpawnSpeedGround ?? 0) > (best?.SpawnSpeedGround ?? 0)
				? unit
				: best,
		units?.[0],
	);
	const moveParam = unitForRange?.MoveParam;
	const isBloblobber = BLOBLOBBER_IDS.includes(weapon.Id);
	return {
		Range_SpawnSpeed: unitForRange?.SpawnSpeedGround,
		Range_GoStraightStateEndMaxSpeed: moveParam?.GoStraightStateEndMaxSpeed,
		Range_GoStraightToBrakeStateFrame: moveParam?.GoStraightToBrakeStateFrame,
		Range_FreeGravity: moveParam?.FreeGravity,
		Range_BrakeAirResist: moveParam?.BrakeAirResist,
		Range_BrakeGravity: moveParam?.BrakeGravity,
		Range_BrakeToFreeStateFrame: moveParam?.BrakeToFreeStateFrame,
		Range_ZRate: params.spl__SpawnBulletAdditionMovePlayerParam?.ZRate,
		Range_BounceAfterMaxSpeed: isBloblobber ? 0.6 : undefined,
		Range_BurstFrame: isBloblobber ? 3 : undefined,
	};
}

function rollerRangeParams(_weapon: MainWeapon, params: any) {
	const unit = params.VerticalSwingUnitGroupParam?.Unit?.[0];
	const moveParam = unit?.UnitParam?.MoveParam;
	return {
		Range_SpawnSpeed: unit?.SpawnSpeedBase,
		Range_GoStraightToBrakeStateFrame: moveParam?.GoStraightToBrakeStateFrame,
		Range_FreeGravity: moveParam?.FreeGravity,
		Range_FreeAirResist: moveParam?.FreeAirResist,
		Range_ZRate: params.spl__SpawnBulletAdditionMovePlayerParam?.ZRate,
	};
}

function brushRangeParams(_weapon: MainWeapon, params: any) {
	const unit = params.SwingUnitGroupParam?.Unit?.[0];
	const moveParam = unit?.UnitParam?.MoveParam;
	return {
		Range_SpawnSpeed: unit?.SpawnSpeedBase,
		Range_GoStraightToBrakeStateFrame: moveParam?.GoStraightToBrakeStateFrame,
		Range_ZRate: params.spl__SpawnBulletAdditionMovePlayerParam?.ZRate,
	};
}

function splatanaRangeParams(_weapon: MainWeapon, params: any) {
	const bulletParam = params.BulletSaberVerticalParam;
	const moveParam = bulletParam?.MoveParam;
	return {
		Range_SpawnSpeed: moveParam?.SpawnSpeed,
		Range_GoStraightStateEndMaxSpeed: moveParam?.GoStraightStateEndMaxSpeed,
		Range_GoStraightToBrakeStateFrame: moveParam?.GoStraightToBrakeStateFrame,
		Range_FreeGravity: moveParam?.FreeGravity,
		Range_BrakeAirResist: moveParam?.BrakeAirResist,
		Range_BrakeGravity: moveParam?.BrakeGravity,
		Range_BrakeToFreeStateFrame: moveParam?.BrakeToFreeStateFrame,
		Range_BurstFrame: bulletParam?.BurstParam?.BurstFrame,
	};
}

function stringerRangeParams(weapon: MainWeapon, params: any) {
	const bulletParam = params.spl__BulletStringerParam;
	const moveParam = bulletParam?.MoveParam;
	const blastRadius = REEF_LUX_IDS.includes(weapon.Id)
		? undefined
		: bulletParam?.DetonationParam?.BlastParam?.DistanceDamage?.[0]?.Distance;
	return {
		Range_SpawnSpeed: moveParam?.SpawnSpeedMax,
		Range_GoStraightStateEndMaxSpeed: moveParam?.GoStraightStateEndMaxSpeed,
		Range_GoStraightToBrakeStateFrame: moveParam?.GoStraightToBrakeStateFrame,
		Range_FreeGravity: moveParam?.FreeGravity,
		Range_FreeAirResist: moveParam?.FreeAirResist,
		Range_BrakeAirResist: moveParam?.BrakeAirResist,
		Range_BrakeGravity: moveParam?.BrakeGravity,
		Range_BrakeToFreeStateFrame: moveParam?.BrakeToFreeStateFrame,
		BlastRadius: blastRadius,
	};
}

function splatlingRangeParams(weapon: MainWeapon, params: any) {
	const isBallpoint = BALLPOINT_SPLATLING_IDS.includes(weapon.Id);
	const moveParam = isBallpoint ? params.VariableMoveParam : params.MoveParam;
	return {
		Range_SpawnSpeed: isBallpoint
			? moveParam?.SpawnSpeed
			: moveParam?.SpawnSpeedFirstLastAndSecond,
		Range_GoStraightStateEndMaxSpeed: moveParam?.GoStraightStateEndMaxSpeed,
		Range_GoStraightToBrakeStateFrame: moveParam?.GoStraightToBrakeStateFrame,
	};
}

function resolveMainWeaponParams(
	weapon: MainWeapon,
	params: any,
	resolvers: Record<string, MainWeaponParamResolver>,
) {
	const result: Record<string, any> = {};
	for (const [key, resolver] of Object.entries(resolvers)) {
		result[key] =
			typeof resolver === "function"
				? resolver(params, weapon)
				: firstDefinedParam(params, resolver);
	}
	return result;
}

/** Same as chaining the paths with `??`: the first non-nullish value, else the last path's value. */
function firstDefinedParam(params: any, paramPaths: readonly string[]): any {
	let value: any;
	for (const paramPath of paramPaths) {
		value = paramAt(params, paramPath);
		if (value !== null && value !== undefined) return value;
	}
	return value;
}

function paramAt(params: any, paramPath: string): any {
	let value = params;
	for (const key of paramPath.split(".")) {
		if (value === null || value === undefined) return undefined;
		value = value[key];
	}
	return value;
}

function weaponSpeedType(params: any) {
	return params.MainWeaponSetting?.WeaponSpeedType === "Mid"
		? undefined
		: params.MainWeaponSetting?.WeaponSpeedType;
}

function moveSpeedCharge(params: any, weapon: MainWeapon) {
	if (weapon.Id === 4010) return 0.062;

	return (
		params.WeaponParam?.MoveSpeed_Charge ??
		params.spl__WeaponSaberParam?.SwingParam?.ChargeMoveVelLimit
	);
}

// for blasters these values are the same and represent damage caused by direct
function directDamageValue(params: any) {
	return params.DamageParam?.ValueMax &&
		params.DamageParam?.ValueMax === params.DamageParam?.ValueMin
		? params.DamageParam?.ValueMax
		: undefined;
}

function damageValueMax(params: any) {
	if (directDamageValue(params)) return undefined;

	return (
		params.DamageParam?.ValueMax ??
		params.spl__BulletStringerParam?.DamageParam?.DirectHitDamageMax ??
		params.spl__BulletShelterShotgunParam?.DamageEffectiveTotalMax
	);
}

function damageValueMin(params: any) {
	return !directDamageValue(params)
		? (params.DamageParam?.ValueMin ??
				params.spl__BulletStringerParam?.DamageParam?.DirectHitDamageMin)
		: undefined;
}

function slosherDirectDamage(params: any) {
	const DamageParam_ValueDirectMax =
		params.UnitGroupParam?.Unit?.[0]?.DamageParam?.ValueMax;
	const DamageParam_ValueDirectMin =
		params.UnitGroupParam?.Unit?.[0]?.DamageParam?.ValueMin;

	if (
		DamageParam_ValueDirectMax &&
		DamageParam_ValueDirectMax === DamageParam_ValueDirectMin
	) {
		return {
			DamageParam_ValueDirect: DamageParam_ValueDirectMax,
		};
	}

	return {
		DamageParam_ValueDirectMax,
		DamageParam_ValueDirectMin,
	};
}

function slosherDirectDamageSecondary(weapon: MainWeapon, params: any) {
	if (!DREAD_WRINGER_IDS.includes(weapon.Id)) return;

	const DamageParam_Secondary_ValueDirectMax =
		params.UnitGroupParam?.Unit?.[1]?.DamageParam?.ValueMax;
	const DamageParam_Secondary_ValueDirectMin =
		params.UnitGroupParam?.Unit?.[1]?.DamageParam?.ValueMin;

	return {
		DamageParam_Secondary_ValueDirectMax,
		DamageParam_Secondary_ValueDirectMin,
	};
}

function sloshingMachineSplashDamage(params: any, weapon: MainWeapon) {
	return SLOSHING_MACHINE_IDS.includes(weapon.Id)
		? params.UnitGroupParam?.Unit?.[1]?.DamageParam?.ValueMax
		: undefined;
}

function blastDistanceDamage(params: any, weapon: MainWeapon) {
	// REEF-LUX has distance damage listed in params
	// but actually doesn't deal it in game
	if (REEF_LUX_IDS.includes(weapon.Id)) return undefined;

	return (
		params.BlastParam?.DistanceDamage ??
		params.BlastParam?.BlastParam?.DistanceDamage ??
		params.spl__BulletStringerParam?.DetonationParam?.BlastParam?.DistanceDamage
	);
}

function fullChargeMaxDamage(params: any) {
	return params.DamageParam?.ValueFullChargeMax !== damageValueMax(params)
		? params.DamageParam?.ValueFullChargeMax
		: undefined;
}

function splatanaHorizontalDirectDamage(params: any) {
	const damage =
		params.BulletSaberHorizontalParam?.DamageParam?.HitDamage +
		params.BulletSaberSlashHorizontalParam?.DamageParam?.DamageValue;

	return Number.isNaN(damage) ? undefined : damage;
}

function swingSplashDamage(swingGroupKey: string, bound: "Min" | "Max") {
	const pickBound = bound === "Min" ? Math.min : Math.max;

	return (params: any) => {
		const damageParam = params[swingGroupKey]?.DamageParam;

		return resolveBound(
			damageParam?.Inside?.[`Damage${bound}Value`],
			damageParam?.Outside?.[`Damage${bound}Value`],
			pickBound,
		);
	};
}

function resolveBound(
	valueOne: number | null | undefined,
	valueTwo: number | null | undefined,
	pickBound: (valueOne: number, valueTwo: number) => number,
): number | undefined {
	if (typeof valueOne !== "number" && typeof valueTwo !== "number")
		return undefined;

	if (typeof valueOne !== "number") return valueTwo as number;
	if (typeof valueTwo !== "number") return valueOne;

	return pickBound(valueOne, valueTwo);
}

function canopyHp(params: any, weapon: MainWeapon) {
	return (
		params.spl__BulletShelterCanopyParam?.CanopyHP ??
		(DEFAULT_CANOPY_HP_BRELLA_IDS.includes(weapon.Id) ? 5000 : undefined)
	);
}

function keepChargeFullFrame(params: any) {
	const KeepChargeFullFrame =
		params.WeaponKeepChargeParam?.KeepChargeFullFrame ??
		params.spl__WeaponStringerParam?.ChargeKeepParam?.KeepChargeFullFrame;

	return KeepChargeFullFrame !== 1 ? KeepChargeFullFrame : undefined;
}

function defaultInkConsume(params: any) {
	const weaponParamType = params.WeaponParam?.$type;

	return weaponParamType !== SPLATLING_WEAPON_PARAM_TYPE &&
		weaponParamType !== SLOSHER_WEAPON_PARAM_TYPE
		? params.WeaponParam?.InkConsume
		: undefined;
}

function slosherInkConsume(params: any) {
	return params.WeaponParam?.$type === SLOSHER_WEAPON_PARAM_TYPE
		? params.WeaponParam?.InkConsume
		: undefined;
}

function splatlingInkConsume(params: any) {
	return params.WeaponParam?.$type === SPLATLING_WEAPON_PARAM_TYPE
		? params.WeaponParam?.InkConsume
		: undefined;
}

function brellaShieldInkConsume(params: any) {
	return params.spl__WeaponShelterCanopyParam?.InkConsumeUmbrella !== 0
		? params.spl__WeaponShelterCanopyParam?.InkConsumeUmbrella
		: undefined;
}

function collectLevelDependentParams(params: any) {
	const result: any = {};

	for (const parentValue of Object.values(params)) {
		for (const entries of Object.entries(parentValue as any)) {
			const [key, value]: any = entries;
			if (
				key === "SubSpecialSpecUpList" ||
				value.High !== value.Mid ||
				value.Mid !== value.Low
			) {
				result[key] = value;
			}

			for (const innerEntries of Object.entries(value)) {
				const [innerMostKey, innerMostValue]: any = innerEntries;
				if (typeof innerMostValue !== "object") continue;
				if (
					innerMostKey === "SubSpecialSpecUpList" ||
					innerMostValue.High !== innerMostValue.Mid ||
					innerMostValue.Mid !== innerMostValue.Low
				) {
					result[innerMostKey] = innerMostValue;
				}
			}
		}
	}

	return result;
}

function resolveSpecialWeaponOverwrites(params: any) {
	const resultUnwrapped = unwrapSubSpecialSpecUpList(
		collectLevelDependentParams(params),
	);

	const specialDurationFrameKeyAlises = [
		"LaserFrame",
		"RainyFrame",
		"SpecialTotalFrame",
	];

	for (const key of specialDurationFrameKeyAlises) {
		if (!resultUnwrapped[key]) continue;

		resultUnwrapped.SpecialDurationFrame = resultUnwrapped[key];
		resultUnwrapped[key] = undefined;
	}

	if (resultUnwrapped.SplashAroundPaintRadius) {
		resultUnwrapped.PaintRadius = {
			High:
				resultUnwrapped.SplashAroundPaintRadius.High +
				resultUnwrapped.PaintRadius.High,
			Mid:
				resultUnwrapped.SplashAroundPaintRadius.Mid +
				resultUnwrapped.PaintRadius.Mid,
			Low:
				resultUnwrapped.SplashAroundPaintRadius.Low +
				resultUnwrapped.PaintRadius.Low,
		};

		resultUnwrapped.SplashAroundPaintRadius = undefined;
	}

	// Bubble Patch 7.2.0 change hack
	if (resultUnwrapped.MaxFieldHP) {
		resultUnwrapped.MaxFieldHP = {
			High: 28800,
			Low: 24000,
			Mid: 26400,
		};
	}

	return resultUnwrapped;
}

function specialDirectDamage(params: any) {
	return (
		params.DamageParam?.DirectHitDamage ??
		params.spl__BulletSpShockSonarParam?.GeneratorParam?.HitDamage ??
		(isKraken(params) ? 1200 : undefined) ??
		(isInkjet(params) ? 1200 : undefined) ??
		(isScreen(params) ? 400 : undefined)
	);
}

function ultraStampSwingDamage(params: any) {
	if (!isUltraStamp(params)) return;

	return [
		{ Damage: 1000, Distance: 0 },
		...params.SwingBigBlastParam.DistanceDamage,
	];
}

function ultraStampThrowDamage(params: any) {
	if (!isUltraStamp(params)) return;

	return params.ThrowBlastParam.DistanceDamage;
}

function crabTankCannonDamage(params: any) {
	if (!isCrabTank(params)) return;

	invariant(
		params.CannonParam.BlastParam.DistanceDamage,
		"Could not find cannon distance damage",
	);

	return [
		{
			Damage: 500,
			Distance: 1,
		},
		...params.CannonParam.BlastParam.DistanceDamage,
	];
}

function specialBumpDamage(params: any) {
	if (isCrabTank(params)) return 400;

	return isReefslider(params) ? params.BulletParam.DamageValue : undefined;
}

function specialTickDamage(params: any) {
	return (
		(isBooyahBomb(params) ? 33 : undefined) ??
		(isInkStorm(params) ? 4 : undefined) ??
		(isInkstrike(params) ? 75 : undefined) ??
		params.spl__BulletSpMicroLaserBitParam?.LaserParam?.LaserDamage
	);
}

function isUltraStamp(params: any) {
	return !!params.SwingBigBlastParam;
}

function isCrabTank(params: any) {
	return !!params.CannonParam;
}

function isKraken(params: any) {
	return !!params.BodyParam?.DamageJumpValue;
}

function isInkjet(params: any) {
	return !!params.JetParam;
}

function isScreen(params: any) {
	return !!params.WallParam;
}

function isInkStorm(params: any) {
	return !!params.CloudParam;
}

function isInkstrike(params: any) {
	return !!params.MotherParam;
}

function isReefslider(params: any) {
	return params.BulletParam?.$type === "spl__BulletSpSkewerParam";
}

function isBooyahBomb(params: any) {
	return params.BlastParam?.$type === "spl__BulletSpNiceBallBlastParam";
}

void main();
