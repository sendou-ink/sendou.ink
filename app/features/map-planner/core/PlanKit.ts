// What a player's weapon brings with it: the other kits of the same weapon,
// its sub and special, which specials leave something on the map and the
// range circles to draw, in map coordinates.

import {
	mainWeaponParams,
	weaponParams,
} from "~/features/build-analyzer/core/utils";
import * as SpecialWeaponRange from "~/features/comp-analyzer/core/SpecialWeaponRange";
import * as WeaponRange from "~/features/comp-analyzer/core/WeaponRange";
import type {
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import {
	BIG_BUBBLER_ID,
	BOOYAH_BOMB_ID,
	canonicalWeaponSplId,
	INK_STORM_ID,
	KILLER_WAIL_ID,
	mainWeaponIds,
	SPLATTERCOLOR_SCREEN_ID,
	SUPER_CHUMP_ID,
	TACTICOOLER_ID,
	TENTA_MISSILES_ID,
	TRIPLE_INKSTRIKE_ID,
	WAVE_BREAKER_ID,
	weaponIdToBaseWeaponId,
	weaponIdToType,
} from "~/modules/in-game-lists/weapon-ids";
import type { PlanMarker, PlanPlayer } from "./PlanDocument";

/**
 * Map coordinates per game distance unit, from map planner v1 drawing the MINI render 1127 px wide
 * at 4.4 px per unit.
 */
// XXX: take the scale from the map's data once maps have cutouts
const MAP_UNITS_PER_GAME_UNIT = (4.4 * 1920) / 1127;

/** Specials that are placed, thrown or aimed somewhere away from the player, see {@link isPlacedSpecial}. */
const PLACED_SPECIAL_IDS: ReadonlySet<SpecialWeaponId> = new Set([
	BIG_BUBBLER_ID,
	TENTA_MISSILES_ID,
	INK_STORM_ID,
	BOOYAH_BOMB_ID,
	WAVE_BREAKER_ID,
	KILLER_WAIL_ID,
	TRIPLE_INKSTRIKE_ID,
	TACTICOOLER_ID,
	SUPER_CHUMP_ID,
	SPLATTERCOLOR_SCREEN_ID,
]);

/** Ranges of players by weapon and whether in special, as simulating a main weapon's shot takes a while. */
const playerRangesCache = new Map<string, RangeCircle[]>();

/** A range circle around a token or marker, in map coordinates. */
export interface RangeCircle {
	radius: number;
	/** `reach` is how far the weapon gets, `blast` the explosion around where it lands. */
	kind: "reach" | "blast";
}

/** The sub of a weapon's kit. */
export function subOf(weaponId: MainWeaponId): SubWeaponId {
	return mainWeaponParams(weaponId).subWeaponId;
}

/** The special of a weapon's kit. */
export function specialOf(weaponId: MainWeaponId): SpecialWeaponId {
	return mainWeaponParams(weaponId).specialWeaponId;
}

/**
 * The kit after `weaponId`'s among the kits of the same weapon, e.g. Splattershot → Tentatek
 * Splattershot → Glamorz Splattershot → Splattershot. Alt skins (Hero Shot Replica…) count as the
 * kit they copy and switch to the plain weapon's next kit.
 */
export function nextKit(weaponId: MainWeaponId): MainWeaponId {
	const baseWeaponId = weaponIdToBaseWeaponId(weaponId);
	const kits = mainWeaponIds.filter(
		(id) =>
			weaponIdToBaseWeaponId(id) === baseWeaponId &&
			weaponIdToType(id) !== "ALT_SKIN",
	);
	const index = kits.indexOf(canonicalWeaponSplId(weaponId));

	return kits[(index + 1) % kits.length];
}

/**
 * Whether a special leaves something on the map away from the player, e.g. a placed Wave Breaker,
 * a thrown Booyah Bomb or Triple Inkstrike's target, rather than being used where the player is.
 */
export function isPlacedSpecial(specialWeaponId: SpecialWeaponId) {
	return PLACED_SPECIAL_IDS.has(specialWeaponId);
}

/**
 * Range circles around a player's token: the special's while in special, otherwise the main
 * weapon's. A reach circle and, for weapons that explode where they land, a blast circle around
 * it. Empty when the game data has no range for it.
 */
export function rangesOfPlayer(
	player: Pick<PlanPlayer, "weaponId" | "specialActive">,
): RangeCircle[] {
	const key = `${player.weaponId}:${player.specialActive}`;
	const cached = playerRangesCache.get(key);
	if (cached) return cached;

	const ranges = uncachedRangesOfPlayer(player);
	playerRangesCache.set(key, ranges);
	return ranges;
}

/**
 * Range circle around a marker of `owner`: a sub's blast, or the area of a placed special (Wave
 * Breaker's waves, Booyah Bomb's blast…). Empty when the game data has none.
 */
export function rangesOfMarker(
	marker: Pick<PlanMarker, "kind">,
	owner: Pick<PlanPlayer, "weaponId">,
): RangeCircle[] {
	const radius =
		marker.kind === "sub"
			? subBlastRadius(subOf(owner.weaponId))
			: placedSpecialRadius(specialOf(owner.weaponId));
	if (!radius) return [];

	return [{ radius: radius * MAP_UNITS_PER_GAME_UNIT, kind: "blast" }];
}

function mainWeaponRange(weaponId: MainWeaponId) {
	const range = WeaponRange.ofMainWeapon(weaponId);
	return range.rangeType === "unsupported" ? null : range;
}

function placedSpecialRadius(specialWeaponId: SpecialWeaponId) {
	const range = SpecialWeaponRange.ofSpecial(specialWeaponId);
	if (!range) return null;

	return range.rangeType === "radius" ? range.range : range.blastRadius;
}

/** Farthest distance any explosion of the sub still deals damage. */
function subBlastRadius(subWeaponId: SubWeaponId) {
	const params = weaponParams().subWeapons[subWeaponId];
	const distances = [
		params.DistanceDamage,
		params.DistanceDamage_BlastParamArray,
		params.DistanceDamage_BlastParamChase,
		params.DistanceDamage_SplashBlastParam,
	]
		.flat(2)
		.flatMap((distanceDamage) =>
			distanceDamage ? [distanceDamage.Distance] : [],
		);

	return distances.length > 0 ? Math.max(...distances) : null;
}

function uncachedRangesOfPlayer(
	player: Pick<PlanPlayer, "weaponId" | "specialActive">,
): RangeCircle[] {
	const range = player.specialActive
		? SpecialWeaponRange.ofSpecial(specialOf(player.weaponId))
		: mainWeaponRange(player.weaponId);
	if (!range || range.range <= 0) return [];

	return [
		{ radius: range.range * MAP_UNITS_PER_GAME_UNIT, kind: "reach" },
		...(range.blastRadius
			? [
					{
						radius: (range.range + range.blastRadius) * MAP_UNITS_PER_GAME_UNIT,
						kind: "blast" as const,
					},
				]
			: []),
	];
}
