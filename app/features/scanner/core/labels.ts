/**
 * English display labels for the ids scanner events carry. UI-only: events and
 * detectors speak sendou ids; these turn them back into names for cards, CSV
 * export and the fixture exporter's informational *Label fields.
 */

import type {
	MainWeaponId,
	ModeShort,
	SpecialWeaponId,
	StageId,
	SubWeaponId,
} from "~/modules/in-game-lists/types";
import gameMisc from "../../../../locales/en/game-misc.json";
import {
	ALL_WEAPON_ENTRIES,
	type WeaponType,
} from "../core/detectors/death/weapon-names";
import type { ScannerLobby } from "../scanner-types";
import type { XRankPositionData } from "./detectors/x-rank/position";
import type { XSetCountData } from "./detectors/x-rank/set-count";
import type { XSetResultData } from "./detectors/x-rank/set-result";

const MISC = gameMisc as Record<string, string>;

const WEAPON_NAME_BY_KIND_AND_ID = new Map(
	ALL_WEAPON_ENTRIES.map((e) => [`${e.type}:${e.id}`, e.name]),
);

export function weaponLabel(
	type: WeaponType | null,
	id: MainWeaponId | SubWeaponId | SpecialWeaponId | null,
): string | null {
	if (type === null || id === null) return null;
	return WEAPON_NAME_BY_KIND_AND_ID.get(`${type}:${id}`) ?? String(id);
}

export function mainWeaponLabel(id: MainWeaponId | null): string | null {
	return id === null ? null : weaponLabel("MAIN", id);
}

export function stageLabel(stageId: StageId | null): string | null {
	return stageId === null
		? null
		: (MISC[`STAGE_${stageId}`] ?? String(stageId));
}

export function modeLabel(mode: ModeShort | null): string | null {
	return mode === null ? null : (MISC[`MODE_LONG_${mode}`] ?? mode);
}

const LOBBY_LABELS: Record<ScannerLobby, string> = {
	X: "X Battle",
	SERIES: "Anarchy Battle (Series)",
	OPEN: "Anarchy Battle (Open)",
	PRIVATE: "Private Battle",
	REGULAR: "Regular Battle",
	CHALLENGE: "Challenge",
	SPLATFEST_OPEN: "Splatfest Battle (Open)",
	SPLATFEST_PRO: "Splatfest Battle (Pro)",
	TRICOLOR: "Tricolor Battle",
};

export function lobbyLabel(lobby: ScannerLobby | null): string | null {
	return lobby === null ? null : LOBBY_LABELS[lobby];
}

/** "2-2", "?" for an unread side. */
export function xSetCountLabel(data: XSetCountData): string {
	return `${data.wins ?? "?"}-${data.losses ?? "?"}`;
}

/** "LLWWL · X Power 2723.2 (-29.2)" */
export function xSetResultLabel(data: XSetResultData): string {
	const results = data.results.map((r) => (r === "WIN" ? "W" : "L")).join("");
	const change =
		data.powerChange === null
			? ""
			: ` (${data.powerChange > 0 ? "+" : ""}${data.powerChange.toFixed(1)})`;
	const power = data.power === null ? "?" : data.power.toFixed(1);
	return `${results} · X Power ${power}${change}`;
}

/** "#259 ↓" */
export function xRankPositionLabel(data: XRankPositionData): string {
	const arrow =
		data.direction === "UP" ? " ↑" : data.direction === "DOWN" ? " ↓" : "";
	return `#${data.position ?? "?"}${arrow}`;
}
