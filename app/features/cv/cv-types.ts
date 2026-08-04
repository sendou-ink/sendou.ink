/**
 * Shared domain vocabulary for the CV feature: events, snap tables, and
 * constants speak sendou.ink's id types (ModeShort, StageId, weapon ids,
 * Ability) — canonical English strings live only inside the OCR snap
 * layer and never leave a detector.
 */
import { abilities } from "~/modules/in-game-lists/abilities";
import type { Ability, MainWeaponId } from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";

/** The scoreboard header's lobby tag. PRIVATE marks tournament games. */
export const CV_LOBBIES = ["X", "SERIES", "OPEN", "PRIVATE"] as const;
export type CvLobby = (typeof CV_LOBBIES)[number];

/**
 * A detected gear ability: a sendou ability id, or the explicit
 * unrecognized marker (the UNKNOWN template in the shared img/abilities
 * set — distinct from null, which means the badge was covered/absent).
 */
export type CvAbility = Ability | "UNKNOWN"; // xxx: why not AbilityWithUnknown

const MAIN_WEAPON_ID_SET: ReadonlySet<number> = new Set(mainWeaponIds);
const ABILITY_SET: ReadonlySet<string> = new Set(abilities.map((a) => a.name));

/** Narrow a template/manifest id to a MainWeaponId; null when unknown. */
export function toMainWeaponId(id: number | string): MainWeaponId | null {
	const n = Number(id);
	return MAIN_WEAPON_ID_SET.has(n) ? (n as MainWeaponId) : null;
}

/** Narrow an ability-template id to a CvAbility; null when unknown. */
export function toCvAbility(id: string): CvAbility | null {
	if (id === "UNKNOWN") return id;
	return ABILITY_SET.has(id) ? (id as Ability) : null;
}
