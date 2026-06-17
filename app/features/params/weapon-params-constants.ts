import type { DamageReceiver } from "~/features/object-damage-calculator/calculator-types";

/**
 * Sentinel `category` used for the special points entry in patch change data, since special
 * points are not a regular weapon parameter. The matching `key` is also this value.
 */
export const SPECIAL_POINTS_PARAM_KEY = "__specialPoints__";

/**
 * Sentinel `category` used for damage multiplier (damage rate vs objects) entries in patch
 * change data. The `key` of such a change holds the damage receiver target instead.
 */
export const DAMAGE_MULTIPLIER_PARAM_KEY = "__damageMultiplier__";

/**
 * Sentinel `category` used for incoming damage multiplier entries in patch change data: a change
 * to some *other* weapon's damage rate against the page's sub or special weapon (which is itself a
 * damageable object). The `key` holds the damage receiver target, and `attackers` holds the
 * weapons whose rate changed.
 */
export const INCOMING_DAMAGE_MULTIPLIER_PARAM_KEY =
	"__incomingDamageMultiplier__";

/**
 * Maps a sub or special weapon to the object {@link DAMAGE_RECEIVERS} target(s) that represent it,
 * so the patch history can surface changes to other weapons' damage rates *against* the kit's sub
 * or special. Only weapons that exist as a damageable object are listed.
 */
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
