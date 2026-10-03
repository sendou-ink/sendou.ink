/**
 * Shared domain vocabulary for the scanner: events, snap tables and constants
 * speak sendou.ink's id types — canonical English strings never leave a detector.
 */
import { abilities } from "~/modules/in-game-lists/abilities";
import type {
	Ability,
	AbilityWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import { mainWeaponIds } from "~/modules/in-game-lists/weapon-ids";

/**
 * The scoreboard header's lobby tag. PRIVATE marks tournament games. The casual
 * lobbies are in the closed set so their headers snap to themselves instead of
 * reading as unknown (or as a lookalike ranked lobby).
 */
export const SCANNER_LOBBIES = [
	"X",
	"SERIES",
	"OPEN",
	"PRIVATE",
	"REGULAR",
	"CHALLENGE",
	"SPLATFEST_OPEN",
	"SPLATFEST_PRO",
	"TRICOLOR",
] as const;
export type ScannerLobby = (typeof SCANNER_LOBBIES)[number];

const UPLOADED_LOBBIES: ReadonlySet<ScannerLobby> = new Set(["PRIVATE", "X"]);

/** Whether /ingest stores games of this lobby; an unread lobby gets the benefit of the doubt. */
export function isUploadedLobby(lobby: ScannerLobby | null): boolean {
	return lobby === null || UPLOADED_LOBBIES.has(lobby);
}

/** Whether games of this lobby link to reported tournament/SendouQ games (private battles); an unread lobby gets the benefit of the doubt. */
export function isLinkableLobby(lobby: ScannerLobby | null): boolean {
	return lobby === null || lobby === "PRIVATE";
}

const MAIN_WEAPON_ID_SET: ReadonlySet<number> = new Set(mainWeaponIds);
const ABILITY_SET: ReadonlySet<string> = new Set(abilities.map((a) => a.name));

/** Narrow a template/manifest id to a MainWeaponId; null when unknown. */
export function toMainWeaponId(id: number | string): MainWeaponId | null {
	const n = Number(id);
	return MAIN_WEAPON_ID_SET.has(n) ? (n as MainWeaponId) : null;
}

/**
 * Narrows an ability-template id to an AbilityWithUnknown; null when unknown.
 * "UNKNOWN" is a template of its own (badge read but not recognized), distinct from null.
 */
export function toAbilityWithUnknown(id: string): AbilityWithUnknown | null {
	if (id === "UNKNOWN") return id;
	return ABILITY_SET.has(id) ? (id as Ability) : null;
}
