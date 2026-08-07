/**
 * Shared domain vocabulary for the scanner feature: events, snap tables, and
 * constants speak sendou.ink's id types (ModeShort, StageId, weapon ids,
 * Ability) — canonical English strings live only inside the OCR snap
 * layer and never leave a detector.
 */
import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	Ability,
	AbilityWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";

/** The scoreboard header's lobby tag. PRIVATE marks tournament games. */
export const SCANNER_LOBBIES = ["X", "SERIES", "OPEN", "PRIVATE"] as const;
export type ScannerLobby = (typeof SCANNER_LOBBIES)[number];

const MAIN_WEAPON_ID_SET: ReadonlySet<number> = new Set(mainWeaponIds);
const ABILITY_SET: ReadonlySet<string> = new Set(abilities.map((a) => a.name));

/** Narrow a template/manifest id to a MainWeaponId; null when unknown. */
export function toMainWeaponId(id: number | string): MainWeaponId | null {
	const n = Number(id);
	return MAIN_WEAPON_ID_SET.has(n) ? (n as MainWeaponId) : null;
}

/**
 * Narrow an ability-template id to an AbilityWithUnknown; null when the id is
 * not a known template. Note "UNKNOWN" is a template of its own (the badge was
 * read but not recognized) and is distinct from null.
 */
export function toAbilityWithUnknown(id: string): AbilityWithUnknown | null {
	if (id === "UNKNOWN") return id;
	return ABILITY_SET.has(id) ? (id as Ability) : null;
}
