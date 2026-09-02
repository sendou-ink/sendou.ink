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
};

export function lobbyLabel(lobby: ScannerLobby | null): string | null {
	return lobby === null ? null : LOBBY_LABELS[lobby];
}
