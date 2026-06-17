import type { Namespace, TFunction } from "i18next";
import type {
	AnyWeapon,
	DamageType,
} from "~/features/build-analyzer/analyzer-types";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { CombineWith, DamageReceiver } from "./calculator-types";
import type objectDamages from "./core/object-dmg.json";

export const DAMAGE_RECEIVERS = [
	"Chariot", // Crab Tank
	"NiceBall_Armor", // Booyah Bomb Armor
	"ShockSonar", // Wave Breaker
	"GreatBarrier_Barrier", // Big Bubbler Shield
	"GreatBarrier_WeakPoint", // Big Bubbler Weak Point
	"BlowerInhale", // Ink Vac Inhale
	"Decoy", // Super Chump
	"BulletPogo", // Triple Splashdown
	"Gachihoko_Barrier", // Rainmaker Shield
	"Wsb_Flag", // Squid Beakon
	"Wsb_Shield", // Splash Wall
	"Wsb_Sprinkler", // Sprinkler
	"Bomb_TorpedoBullet", // Torpedo
	"BulletUmbrellaCanopyCompact", // Undercover Brella Canopy
	"BulletUmbrellaCanopyNormal", // Splat Brella Canopy
	"BulletUmbrellaCanopyNormal_Launched", // Splat Brella Canopy launched
	"BulletUmbrellaCanopyWide", // Tenta Brella Canopy
	"BulletUmbrellaCanopyWide_Launched", // Tenta Brella Canopy launched
	"BulletShelterCanopyFocus", // Recycled Brella Canopy
	"BulletShelterCanopyFocus_Launched", // Recycled Brella Canopy launched
] as const;

type ReceiverTranslation =
	| { key: string }
	| { weaponKey: string; suffixKey: string };

/**
 * Maps each damage receiver to the i18n key(s) describing the object it represents. Some
 * receivers are a plain weapon/mode name, others combine a weapon name with a suffix (e.g.
 * "<weapon> Canopy"). Consumed via {@link translateDamageReceiver}.
 */
const damageReceiverTranslations: Record<DamageReceiver, ReceiverTranslation> =
	{
		Chariot: { key: "weapons:SPECIAL_12" },
		NiceBall_Armor: {
			weaponKey: "weapons:SPECIAL_6",
			suffixKey: "analyzer:damageReceiver.suffix.armor",
		},
		ShockSonar: { key: "weapons:SPECIAL_7" },
		GreatBarrier_Barrier: {
			weaponKey: "weapons:SPECIAL_2",
			suffixKey: "analyzer:damageReceiver.suffix.shield",
		},
		GreatBarrier_WeakPoint: {
			weaponKey: "weapons:SPECIAL_2",
			suffixKey: "analyzer:damageReceiver.suffix.weakPoint",
		},
		BlowerInhale: {
			weaponKey: "weapons:SPECIAL_8",
			suffixKey: "analyzer:damageReceiver.suffix.inhale",
		},
		Decoy: { key: "weapons:SPECIAL_16" },
		BulletPogo: { key: "weapons:SPECIAL_18" },
		Gachihoko_Barrier: {
			weaponKey: "game-misc:MODE_LONG_RM",
			suffixKey: "analyzer:damageReceiver.suffix.shield",
		},
		Wsb_Flag: { key: "weapons:SUB_8" },
		Wsb_Shield: { key: "weapons:SUB_4" },
		Wsb_Sprinkler: { key: "weapons:SUB_3" },
		Bomb_TorpedoBullet: { key: "weapons:SUB_13" },
		BulletUmbrellaCanopyCompact: {
			weaponKey: "weapons:MAIN_6020",
			suffixKey: "analyzer:damageReceiver.suffix.canopy",
		},
		BulletUmbrellaCanopyNormal: {
			weaponKey: "weapons:MAIN_6000",
			suffixKey: "analyzer:damageReceiver.suffix.canopy",
		},
		BulletUmbrellaCanopyNormal_Launched: {
			weaponKey: "weapons:MAIN_6000",
			suffixKey: "analyzer:damageReceiver.suffix.canopyLaunched",
		},
		BulletUmbrellaCanopyWide: {
			weaponKey: "weapons:MAIN_6010",
			suffixKey: "analyzer:damageReceiver.suffix.canopy",
		},
		BulletUmbrellaCanopyWide_Launched: {
			weaponKey: "weapons:MAIN_6010",
			suffixKey: "analyzer:damageReceiver.suffix.canopyLaunched",
		},
		BulletShelterCanopyFocus: {
			weaponKey: "weapons:MAIN_6030",
			suffixKey: "analyzer:damageReceiver.suffix.canopy",
		},
		BulletShelterCanopyFocus_Launched: {
			weaponKey: "weapons:MAIN_6030",
			suffixKey: "analyzer:damageReceiver.suffix.canopyLaunched",
		},
	};

/**
 * Resolves the localized display name of a damage receiver using the given i18next `t` function.
 * The `weapons`, `analyzer` and `game-misc` namespaces must be available to the caller.
 */
export function translateDamageReceiver<Ns extends Namespace>(
	t: TFunction<Ns>,
	receiver: DamageReceiver,
): string {
	const config = damageReceiverTranslations[receiver];
	if ("key" in config) {
		return t(config.key as never);
	}
	return t(config.suffixKey as never, {
		weapon: t(config.weaponKey as never),
	});
}

/**
 * The suffix-only localized label of a damage receiver (e.g. "Shield", "Weak Point"), or `null`
 * when the receiver is a plain weapon/mode name with no suffix. Used to disambiguate the parts of
 * a multi-part object (e.g. Big Bubbler's shield vs. weak point) without repeating the weapon name.
 */
export function damageReceiverSuffix<Ns extends Namespace>(
	t: TFunction<Ns>,
	receiver: DamageReceiver,
): string | null {
	const config = damageReceiverTranslations[receiver];
	if ("key" in config) {
		return null;
	}
	return String(t(config.suffixKey as never, { weapon: "" })).trim();
}

export const damagePriorities: Array<
	[
		AnyWeapon["type"],
		Array<AnyWeapon["id"]>,
		DamageType,
		keyof typeof objectDamages,
	]
> = [
	["MAIN", [210, 220, 260], "DIRECT", "Blaster_KillOneShot"],
	["MAIN", [210, 260], "DISTANCE", "Blaster_BlasterMiddle"],
	["MAIN", [220], "DISTANCE", "Blaster"],

	["MAIN", [400], "NORMAL_MAX", "Shooter_Flash"],
	["MAIN", [400], "SECONDARY_MODE_MAX", "Shooter_FlashRepeat"],
	["MAIN", [400], "SECONDARY_MODE_MIN", "Shooter_FlashRepeat"],
	["MAIN", [400], "NORMAL_MIN", "Shooter_Flash"],

	["MAIN", [1000], "SPLASH_VERTICAL_MIN", "RollerSplash_Compact"],
	["MAIN", [1000], "SPLASH_VERTICAL_MAX", "RollerSplash_Compact"],
	["MAIN", [1000], "SPLASH_HORIZONTAL_MIN", "RollerSplash_Compact"],
	["MAIN", [1000], "SPLASH_HORIZONTAL_MAX", "RollerSplash_Compact"],
	["MAIN", [1000, 1010, 1020, 1030, 1040], "ROLL_OVER", "RollerCore"],
	["MAIN", [1010], "SPLASH_VERTICAL_MIN", "RollerSplash"],
	["MAIN", [1010], "SPLASH_VERTICAL_MAX", "RollerSplash"],
	["MAIN", [1010], "SPLASH_HORIZONTAL_MIN", "RollerSplash"],
	["MAIN", [1010], "SPLASH_HORIZONTAL_MAX", "RollerSplash"],
	["MAIN", [1020], "SPLASH_VERTICAL_MIN", "RollerSplash_Heavy"],
	["MAIN", [1020], "SPLASH_VERTICAL_MAX", "RollerSplash_Heavy"],
	["MAIN", [1020], "SPLASH_HORIZONTAL_MIN", "RollerSplash_Heavy"],
	["MAIN", [1020], "SPLASH_HORIZONTAL_MAX", "RollerSplash_Heavy"],
	["MAIN", [1030], "SPLASH_VERTICAL_MIN", "RollerSplash_Hunter"],
	["MAIN", [1030], "SPLASH_VERTICAL_MAX", "RollerSplash_Hunter"],
	["MAIN", [1030], "SPLASH_HORIZONTAL_MIN", "RollerSplash_Hunter"],
	["MAIN", [1030], "SPLASH_HORIZONTAL_MAX", "RollerSplash_Hunter"],
	["MAIN", [1040], "SPLASH_VERTICAL_MIN", "RollerSplash_Wide"],
	["MAIN", [1040], "SPLASH_VERTICAL_MAX", "RollerSplash_Wide"],
	["MAIN", [1040], "SPLASH_HORIZONTAL_MIN", "RollerSplash_Wide"],
	["MAIN", [1040], "SPLASH_HORIZONTAL_MAX", "RollerSplash_Wide"],

	["MAIN", [1100, 1110, 1120], "ROLL_OVER", "BrushCore"],
	["MAIN", [1100, 1110], "SPLASH_MIN", "BrushSplash"],
	["MAIN", [1100, 1110], "SPLASH_MAX", "BrushSplash"],
	["MAIN", [1120, 1121], "SPLASH_MIN", "BrushSplash_Heavy"],
	["MAIN", [1120, 1121], "SPLASH_MAX", "BrushSplash_Heavy"],

	["MAIN", [2000, 2010, 2020, 2060], "FULL_CHARGE", "ChargerFull"],
	["MAIN", [2000, 2010, 2020, 2060], "MAX_CHARGE", "Charger"],
	["MAIN", [2000, 2010, 2020, 2060], "TAP_SHOT", "Charger"],
	["MAIN", [2030, 2040], "FULL_CHARGE", "ChargerFull_Long"],
	["MAIN", [2030, 2040], "MAX_CHARGE", "Charger_Long"],
	["MAIN", [2030, 2040], "TAP_SHOT", "Charger_Long"],
	["MAIN", [2050, 2070], "FULL_CHARGE", "ChargerFull_Light"],
	["MAIN", [2050, 2070], "MAX_CHARGE", "Charger_Light"],
	["MAIN", [2050, 2070], "TAP_SHOT", "Charger_Light"],

	["MAIN", [3040], "DIRECT", "Slosher_WashtubBombCore"],
	["MAIN", [3040], "DISTANCE", "Slosher_Washtub"],

	["MAIN", [6000, 6030], "NORMAL_MAX", "ShelterShot"], // TODO: could also list damage caused by Shield bump
	["MAIN", [6000, 6030], "NORMAL_MIN", "ShelterShot"],
	["MAIN", [6010], "NORMAL_MAX", "ShelterShot_Wide"],
	["MAIN", [6010], "NORMAL_MIN", "ShelterShot_Wide"],
	["MAIN", [6020], "NORMAL_MAX", "ShelterShot_Compact"],
	["MAIN", [6020], "NORMAL_MIN", "ShelterShot_Compact"],

	["MAIN", [8000, 8010, 8020], "SPLATANA_VERTICAL", "Saber_ChargeShot"],
	["MAIN", [8000, 8010, 8020], "SPLATANA_VERTICAL_DIRECT", "Saber_ChargeSlash"],
	["MAIN", [8000, 8010, 8020], "SPLATANA_HORIZONTAL", "Saber_Shot"],
	["MAIN", [8000, 8010, 8020], "SPLATANA_HORIZONTAL_DIRECT", "Saber_Slash"],

	["SUB", [0, 2, 7], "BOMB_NORMAL", "Bomb"],
	["SUB", [2], "BOMB_DIRECT", "Bomb_DirectHit"],
	["SUB", [6], "BOMB_DIRECT", "Bomb_CurlingBullet"],
	["SUB", [6], "BOMB_NORMAL", "Bomb"],
	["SUB", [13], "SPLASH", "Bomb_TorpedoSplashBurst"],
	["SUB", [13], "BOMB_DIRECT", "Bomb_TorpedoBullet"],

	["SPECIAL", [4], "BOMB_NORMAL", "MultiMissile_Bullet"], // There is also "MultiMissile_BombCore" but it seems to contain same rates as MultiMissile_Bullet
	["SPECIAL", [5], "SPECIAL_TICK", "InkStorm"],
	["SPECIAL", [8], "SPECIAL_MAX_CHARGE", "BlowerExhale_BombCore"],
	["SPECIAL", [8], "SPECIAL_MIN_CHARGE", "BlowerExhale_BombCore"],
	["SPECIAL", [10], "BOMB_DIRECT", "Jetpack_BombCore"],
	["SPECIAL", [10], "BOMB_NORMAL", "Jetpack_Bullet"],
	["SPECIAL", [11], "SPECIAL_THROW_DIRECT", "UltraStamp_Throw_BombCore"],
	["SPECIAL", [11], "SPECIAL_THROW", "UltraStamp_Throw"],
	["SPECIAL", [11], "SPECIAL_SWING", "UltraStamp_Swing"],
	["SPECIAL", [12], "SPECIAL_CANNON", "Chariot_Cannon"],
	["SPECIAL", [12], "SPECIAL_BULLET_MAX", "Chariot_Cannon"],
	["SPECIAL", [12], "SPECIAL_BULLET_MIN", "Chariot_Cannon"],
	["SPECIAL", [12], "SPECIAL_BUMP", "Chariot_Body"],
	["SPECIAL", [13], "BOMB_NORMAL", "Skewer"],
	["SPECIAL", [18], "BOMB_NORMAL", "Pogo"],
];

export const damageTypesToCombine: Partial<
	Record<MainWeaponId, Array<CombineWith>>
> = {
	// Explosher
	3040: [{ when: "DIRECT", combineWith: "DISTANCE" }],
	// Tri-Stringer
	7010: [{ when: "NORMAL_MAX", combineWith: "DISTANCE" }],
	// Wellstring V
	7030: [{ when: "NORMAL_MAX", combineWith: "DISTANCE" }],
	// Splatana Stamper
	8000: [
		{ when: "SPLATANA_VERTICAL_DIRECT", combineWith: "SPLATANA_VERTICAL" },
		{
			when: "SPLATANA_HORIZONTAL_DIRECT",
			combineWith: "SPLATANA_HORIZONTAL",
			multiplierOnly: true,
		},
	],
	// Splatana Wiper
	8010: [
		{ when: "SPLATANA_VERTICAL_DIRECT", combineWith: "SPLATANA_VERTICAL" },
		{
			when: "SPLATANA_HORIZONTAL_DIRECT",
			combineWith: "SPLATANA_HORIZONTAL",
			multiplierOnly: true,
		},
	],
	// Mint Decavitator
	8020: [
		{ when: "SPLATANA_VERTICAL_DIRECT", combineWith: "SPLATANA_VERTICAL" },
		{
			when: "SPLATANA_HORIZONTAL_DIRECT",
			combineWith: "SPLATANA_HORIZONTAL",
			multiplierOnly: true,
		},
	],
};
