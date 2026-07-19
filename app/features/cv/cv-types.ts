/**
 * Shared domain vocabulary for the CV feature: events, snap tables, and
 * constants speak sendou.ink's id types (ModeShort, StageId, weapon ids,
 * Ability) — canonical English strings live only inside the OCR snap
 * layer and never leave a detector.
 */
import { abilities } from "~/modules/in-game-lists/abilities";
import {
	mainWeaponIds,
	specialWeaponIds,
	subWeaponIds,
} from "~/modules/in-game-lists/weapon-ids";
import type {
	Ability,
	MainWeaponId,
	SpecialWeaponId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";

/** The scoreboard header's lobby tag. PRIVATE marks tournament games. */
export const CV_LOBBIES = ["X", "SERIES", "OPEN", "PRIVATE"] as const;
export type CvLobby = (typeof CV_LOBBIES)[number];

/**
 * A detected gear ability: a sendou ability id, or the explicit
 * unrecognized marker (the UNKNOWN template in assets/cv/abilities —
 * distinct from null, which means the badge was covered/absent).
 */
export type CvAbility = Ability | "UNKNOWN";

const MAIN_WEAPON_ID_SET: ReadonlySet<number> = new Set(mainWeaponIds);
const SUB_WEAPON_ID_SET: ReadonlySet<number> = new Set(subWeaponIds);
const SPECIAL_WEAPON_ID_SET: ReadonlySet<number> = new Set(specialWeaponIds);
const ABILITY_SET: ReadonlySet<string> = new Set(abilities.map((a) => a.name));

/** Narrow a template/manifest id to a MainWeaponId; null when unknown. */
export function toMainWeaponId(id: number | string): MainWeaponId | null {
	const n = Number(id);
	return MAIN_WEAPON_ID_SET.has(n) ? (n as MainWeaponId) : null;
}

export function toSubWeaponId(id: number | string): SubWeaponId | null {
	const n = Number(id);
	return SUB_WEAPON_ID_SET.has(n) ? (n as SubWeaponId) : null;
}

export function toSpecialWeaponId(id: number | string): SpecialWeaponId | null {
	const n = Number(id);
	return SPECIAL_WEAPON_ID_SET.has(n) ? (n as SpecialWeaponId) : null;
}

/** Narrow an ability-template id to a CvAbility; null when unknown. */
export function toCvAbility(id: string): CvAbility | null {
	if (id === "UNKNOWN") return id;
	return ABILITY_SET.has(id) ? (id as Ability) : null;
}
