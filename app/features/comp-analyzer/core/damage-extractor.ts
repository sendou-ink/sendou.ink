import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import type { DamageType } from "../../build-analyzer/analyzer-types";
import {
	mainWeaponParams,
	weaponParams,
} from "../../build-analyzer/core/utils";
import type { CompositionWeapon, DamageSource } from "../comp-analyzer-types";

const MAIN_DAMAGE_TYPES: DamageType[] = [
	"NORMAL_MIN",
	"NORMAL_MAX",
	"NORMAL_MAX_FULL_CHARGE",
	"DIRECT",
	"DIRECT_MIN",
	"DIRECT_MAX",
	"FULL_CHARGE",
	"TAP_SHOT",
	"SPLATANA_VERTICAL_DIRECT",
	"SPLATANA_HORIZONTAL_DIRECT",
	"ROLL_OVER",
	"SPLASH_MIN",
	"SPLASH_MAX",
	"SPLASH_VERTICAL_MIN",
	"SPLASH_VERTICAL_MAX",
	"SPLASH_HORIZONTAL_MIN",
	"SPLASH_HORIZONTAL_MAX",
	"TURRET_MIN",
	"TURRET_MAX",
	"SECONDARY_MODE_MIN",
	"SECONDARY_MODE_MAX",
];

const damageTypeToParamsKey: Record<string, string | string[]> = {
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
};

const damageTypeLabels: Record<string, string> = {
	NORMAL_MIN: "Min",
	NORMAL_MAX: "Max",
	NORMAL_MAX_FULL_CHARGE: "Full Charge",
	DIRECT: "Direct",
	DIRECT_MIN: "Direct Min",
	DIRECT_MAX: "Direct Max",
	FULL_CHARGE: "Full Charge",
	TAP_SHOT: "Tap",
	SPLATANA_VERTICAL_DIRECT: "Vert Direct",
	SPLATANA_HORIZONTAL_DIRECT: "Horiz Direct",
	ROLL_OVER: "Roll",
	SPLASH_MIN: "Splash Min",
	SPLASH_MAX: "Splash Max",
	SPLASH_VERTICAL_MIN: "Vert Splash Min",
	SPLASH_VERTICAL_MAX: "Vert Splash Max",
	SPLASH_HORIZONTAL_MIN: "Horiz Splash Min",
	SPLASH_HORIZONTAL_MAX: "Horiz Splash Max",
	TURRET_MIN: "Turret Min",
	TURRET_MAX: "Turret Max",
	SECONDARY_MODE_MIN: "Alt Min",
	SECONDARY_MODE_MAX: "Alt Max",
	BOMB_NORMAL: "Blast",
	BOMB_DIRECT: "Direct",
	SPECIAL_THROW_DIRECT: "Throw",
	SPECIAL_BUMP: "Bump",
	SPECIAL_CANNON: "Cannon",
	SPECIAL_BULLET_MAX: "Shot",
	SPECIAL_SWING: "Swing",
	SPECIAL_JUMP: "Jump",
	WAVE: "Wave",
	SPECIAL_TICK: "Tick",
	SPECIAL_MAX_CHARGE: "Full Charge",
};

function damageTypeLabel(type: DamageType): string {
	return damageTypeLabels[type] ?? type;
}

interface DistanceDamageEntry {
	Damage: number;
	Distance: number;
}

export function extractWeaponDamages(
	mainWeaponId: MainWeaponId,
	weaponSlot: number,
): CompositionWeapon {
	const params = mainWeaponParams(mainWeaponId);
	const subWeaponId = params.subWeaponId as SubWeaponId;
	const specialWeaponId = params.specialWeaponId as SpecialWeaponId;

	const damages: DamageSource[] = [];

	for (const damageType of MAIN_DAMAGE_TYPES) {
		const keys = [damageTypeToParamsKey[damageType]].flat();
		for (const key of keys) {
			if (!key) continue;
			const value = (params as unknown as Record<string, unknown>)[key];

			if (typeof value === "number" && value > 0) {
				damages.push({
					weaponSlot,
					sourceType: "MAIN",
					sourceId: mainWeaponId,
					damage: value / 10,
					damageType,
					label: damageTypeLabel(damageType),
				});
			}
		}
	}

	const subParams = weaponParams().subWeapons[subWeaponId] as unknown as Record<
		string,
		unknown
	>;
	if (subParams) {
		const distanceDamage = subParams.DistanceDamage;
		if (distanceDamage && Array.isArray(distanceDamage)) {
			const firstEntry = distanceDamage[0] as
				| DistanceDamageEntry
				| DistanceDamageEntry[]
				| undefined;
			if (firstEntry) {
				const closestDamage = Array.isArray(firstEntry)
					? firstEntry[0]
					: firstEntry;
				if (closestDamage && typeof closestDamage.Damage === "number") {
					damages.push({
						weaponSlot,
						sourceType: "SUB",
						sourceId: subWeaponId,
						damage: closestDamage.Damage / 10,
						damageType: "BOMB_NORMAL",
						label: "Blast",
					});
				}
			}
		}

		const directDamage = subParams.DirectDamage;
		if (typeof directDamage === "number" && directDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SUB",
				sourceId: subWeaponId,
				damage: directDamage / 10,
				damageType: "BOMB_DIRECT",
				label: "Direct",
			});
		}
	}

	const specialParams = weaponParams().specialWeapons[
		specialWeaponId
	] as unknown as Record<string, unknown>;
	if (specialParams) {
		const distanceDamage = specialParams.DistanceDamage;
		if (distanceDamage && Array.isArray(distanceDamage)) {
			const closestDamage = distanceDamage[0] as
				| DistanceDamageEntry
				| undefined;
			if (closestDamage && typeof closestDamage.Damage === "number") {
				damages.push({
					weaponSlot,
					sourceType: "SPECIAL",
					sourceId: specialWeaponId,
					damage: closestDamage.Damage / 10,
					damageType: "WAVE",
					label: "Blast",
				});
			}
		}

		const directDamage = specialParams.DirectDamage;
		if (typeof directDamage === "number" && directDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: directDamage / 10,
				damageType: "SPECIAL_THROW_DIRECT",
				label: "Direct",
			});
		}

		const throwDirectDamage = specialParams.ThrowDirectDamage;
		if (typeof throwDirectDamage === "number" && throwDirectDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: throwDirectDamage / 10,
				damageType: "SPECIAL_THROW_DIRECT",
				label: "Throw",
			});
		}

		const bumpDamage = specialParams.BumpDamage;
		if (typeof bumpDamage === "number" && bumpDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: bumpDamage / 10,
				damageType: "SPECIAL_BUMP",
				label: "Bump",
			});
		}

		const cannonDamage = specialParams.CannonDamage;
		if (typeof cannonDamage === "number" && cannonDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: cannonDamage / 10,
				damageType: "SPECIAL_CANNON",
				label: "Cannon",
			});
		}

		const swingDamage = specialParams.SwingDamage;
		if (typeof swingDamage === "number" && swingDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: swingDamage / 10,
				damageType: "SPECIAL_SWING",
				label: "Swing",
			});
		}

		const jumpDamage = specialParams.JumpDamage;
		if (typeof jumpDamage === "number" && jumpDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: jumpDamage / 10,
				damageType: "SPECIAL_JUMP",
				label: "Jump",
			});
		}

		const bulletDamageMax = specialParams.BulletDamageMax;
		if (typeof bulletDamageMax === "number" && bulletDamageMax > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: bulletDamageMax / 10,
				damageType: "SPECIAL_BULLET_MAX",
				label: "Shot",
			});
		}

		const tickDamage = specialParams.TickDamage;
		if (typeof tickDamage === "number" && tickDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: tickDamage / 10,
				damageType: "SPECIAL_TICK",
				label: "Tick",
			});
		}

		const waveDamage = specialParams.WaveDamage;
		if (typeof waveDamage === "number" && waveDamage > 0) {
			damages.push({
				weaponSlot,
				sourceType: "SPECIAL",
				sourceId: specialWeaponId,
				damage: waveDamage / 10,
				damageType: "WAVE",
				label: "Wave",
			});
		}
	}

	return {
		mainWeaponId,
		subWeaponId,
		specialWeaponId,
		damages,
	};
}
