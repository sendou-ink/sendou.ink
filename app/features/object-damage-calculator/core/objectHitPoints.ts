import {
	type AbilityPoints,
	type SpecialWeaponParams,
	type SubWeaponParams,
	hpDivided,
	specialDeviceHp,
	specialFieldHp,
	subStats,
} from "~/features/build-analyzer";
import { weaponParams } from "~/features/build-analyzer/core/weapon-params";
import {
	BIG_BUBBLER_ID,
	CRAB_TANK_ID,
	SPLASH_WALL_ID,
} from "~/modules/in-game-lists";
import invariant from "~/utils/invariant";
import type { HitPoints } from "../calculator-types";

const WAVE_BREAKER_HP = 400;
const SPRINKLER_HP = 120;
const RAINMAKER_HP = 1000;
const SPLAT_BRELLA_SHIELD_HP = 500;
const BOOYAH_BOMB_ARMOR_HP = 470;
const INK_VAC_HP = 800;
const BEAKON_HP = 120;
const TORPEDO_HP = 20;
const SUPER_CHUMP_HP = 60;
const TRIPLE_SPLASHDOWN_HP = 100;

export const objectHitPoints = (abilityPoints: AbilityPoints): HitPoints => {
	const Wsb_Shield = subStats({
		abilityPoints,
		subWeaponParams: weaponParams.subWeapons[SPLASH_WALL_ID] as SubWeaponParams,
	}).subHp?.value;
	const GreatBarrier_Barrier = specialFieldHp({
		abilityPoints,
		specialWeaponParams: weaponParams.specialWeapons[
			BIG_BUBBLER_ID
		] as SpecialWeaponParams,
	})?.value;
	const GreatBarrier_WeakPoint = specialDeviceHp({
		abilityPoints,
		specialWeaponParams: weaponParams.specialWeapons[
			BIG_BUBBLER_ID
		] as SpecialWeaponParams,
	})?.value;

	invariant(Wsb_Shield);
	invariant(GreatBarrier_Barrier);
	invariant(GreatBarrier_WeakPoint);

	return {
		BulletUmbrellaCanopyNormal: SPLAT_BRELLA_SHIELD_HP,
		BulletUmbrellaCanopyWide: hpDivided(
			weaponParams.mainWeapons[6010].CanopyHP,
		),
		BulletUmbrellaCanopyCompact: hpDivided(
			weaponParams.mainWeapons[6020].CanopyHP,
		),
		BulletShelterCanopyFocus: hpDivided(
			weaponParams.mainWeapons[6030].CanopyHP,
		),
		Wsb_Shield,
		Bomb_TorpedoBullet: TORPEDO_HP,
		Chariot: hpDivided(weaponParams.specialWeapons[CRAB_TANK_ID].ArmorHP),
		Gachihoko_Barrier: RAINMAKER_HP,
		GreatBarrier_Barrier,
		GreatBarrier_WeakPoint,
		NiceBall_Armor: BOOYAH_BOMB_ARMOR_HP, // ??
		BlowerInhale: INK_VAC_HP,
		ShockSonar: WAVE_BREAKER_HP,
		Wsb_Flag: BEAKON_HP,
		Wsb_Sprinkler: SPRINKLER_HP,
		Firework: SUPER_CHUMP_HP,
		BulletPogo: TRIPLE_SPLASHDOWN_HP,
	};
};
