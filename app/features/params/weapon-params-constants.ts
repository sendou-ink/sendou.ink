import type { DamageReceiver } from "~/features/object-damage-calculator/calculator-types";

/** Sentinel `category` (and `key`) of special points patch changes, which are not a regular param. */
export const SPECIAL_POINTS_PARAM_KEY = "__specialPoints__";

/** Sentinel `category` of damage multiplier (rate vs objects) patch changes; `key` holds the receiver target. */
export const DAMAGE_MULTIPLIER_PARAM_KEY = "__damageMultiplier__";

/**
 * Sentinel `category` of incoming damage multiplier patch changes (another weapon's rate against the
 * page's damageable sub/special); `key` holds the receiver target, `attackers` the weapons.
 */
export const INCOMING_DAMAGE_MULTIPLIER_PARAM_KEY =
	"__incomingDamageMultiplier__";

/** Sub/special weapon → the {@link DAMAGE_RECEIVERS} target(s) representing it. Only damageable weapons are listed. */
export const INCOMING_DAMAGE_RECEIVERS: Record<
	"sub" | "special",
	Record<number, readonly DamageReceiver[]>
> = {
	special: {
		2: ["GreatBarrier_Barrier", "GreatBarrier_WeakPoint"], // Big Bubbler
		6: ["NiceBall_Armor"], // Booyah Bomb
		7: ["ShockSonar"], // Wave Breaker
		8: ["BlowerInhale"], // Ink Vac
		12: ["Chariot"], // Crab Tank
		16: ["Decoy"], // Super Chump
		18: ["BulletPogo"], // Triple Splashdown
	},
	sub: {
		3: ["Wsb_Sprinkler"], // Sprinkler
		4: ["Wsb_Shield"], // Splash Wall
		8: ["Wsb_Flag"], // Squid Beakon
		13: ["Bomb_TorpedoBullet"], // Torpedo
	},
};
