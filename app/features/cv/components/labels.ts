/**
 * English display labels for the ids CV events carry. UI-only: events and
 * detectors speak sendou ids (§ cv-types.ts); these helpers turn them back
 * into human-readable names for cards, CSV export, and the fixture
 * exporter's informational *Label fields.
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
import type { CvLobby } from "../cv-types";

const misc = gameMisc as Record<string, string>;

const weaponNameByKindAndId = new Map(
	ALL_WEAPON_ENTRIES.map((e) => [`${e.type}:${e.id}`, e.name]),
);

export function weaponLabel(
	type: WeaponType | null,
	id: MainWeaponId | SubWeaponId | SpecialWeaponId | null,
): string | null {
	if (type === null || id === null) return null;
	return weaponNameByKindAndId.get(`${type}:${id}`) ?? String(id);
}

export function mainWeaponLabel(id: MainWeaponId | null): string | null {
	return id === null ? null : weaponLabel("MAIN", id);
}

export function stageLabel(stageId: StageId | null): string | null {
	return stageId === null
		? null
		: (misc[`STAGE_${stageId}`] ?? String(stageId));
}

export function modeLabel(mode: ModeShort | null): string | null {
	return mode === null ? null : (misc[`MODE_LONG_${mode}`] ?? mode);
}

const LOBBY_LABELS: Record<CvLobby, string> = {
	X: "X Battle",
	SERIES: "Anarchy Battle (Series)",
	OPEN: "Anarchy Battle (Open)",
	PRIVATE: "Private Battle",
};

export function lobbyLabel(lobby: CvLobby | null): string | null {
	return lobby === null ? null : LOBBY_LABELS[lobby];
}
