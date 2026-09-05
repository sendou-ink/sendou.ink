/**
 * Flattens detected events into one CSV. One row per event; types share
 * columns where they overlap, and a scoreboard's eight player rows (or the
 * minimap's cards, or the objective HUD's icon strip) pack into one cell.
 */

import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
} from "../core/detectors/minimap/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "../core/detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
} from "../core/detectors/objective/player-status";
import {
	STRIP_WEAPONS_EVENT_TYPE,
	type StripWeaponsData,
} from "../core/detectors/objective/strip-weapons";
import {
	SCOREBOARD_EVENT_TYPE,
	type ScoreboardData,
} from "../core/detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../core/detectors/scoreboard-battle-log/index";
import {
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
	type ScoreboardBattleLogReplayData,
} from "../core/detectors/scoreboard-battle-log-replay/index";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
import { formatClock, formatTime } from "./format";
import {
	lobbyLabel,
	mainWeaponLabel,
	modeLabel,
	stageLabel,
	weaponLabel,
} from "./labels";

export interface CsvEvent {
	type: string;
	/** video/stream time in seconds */
	t: number;
	/** wall-clock time of detection (live capture only) */
	detectedAt?: number;
	confidence: number;
	data: unknown;
}

const HEADER = [
	"type",
	"time",
	"t_seconds",
	"detected_at",
	"confidence",
	"lobby",
	"mode",
	"stage",
	"winner_score",
	"loser_score",
	"pov",
	"weapon",
	"name",
	"abilities",
	"players",
	"replay_code",
	"replay_timestamp",
];

type Cell = string | number | null | undefined;

function csvCell(value: Cell): string {
	if (value === null || value === undefined) return "";
	const s = String(value);
	return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** [head, clothes, shoes] rows of [main, sub, sub, sub] ability ids */
function formatAbilities(rows: string[][]): string {
	return rows.map((row) => row.join("+")).join(" | ");
}

/** the minimap's flat [head, clothes, shoes] main-ability row */
function formatMinimapAbilities(abilities: (string | null)[]): string {
	return abilities.map((a) => a ?? "?").join("+");
}

function formatMinimapPlayers(data: MinimapData): string {
	const fmt = (
		label: string,
		p: {
			name: string | null;
			weaponId: number | null;
			abilities: (string | null)[];
			dead: boolean;
			specialReady: boolean;
		},
	) =>
		`${label} ${p.name ?? "?"} · ${mainWeaponLabel(p.weaponId as MainWeaponId | null) ?? "?"} · ${formatMinimapAbilities(p.abilities)}` +
		`${p.dead ? " · splatted" : ""}${p.specialReady ? " · special" : ""}`;
	return [
		...data.teammates.map((p) => fmt(p.slot, p)),
		...data.enemies.map((p, i) => fmt(`enemy${i + 1}`, p)),
	].join("; ");
}

/** one team's four slots as top-candidate weapon names, ✕ = splatted */
function formatStripWeaponsSide(data: StripWeaponsData, side: 0 | 1): string {
	return data.slots[side]
		.map((candidates) =>
			candidates === null
				? "✕"
				: (mainWeaponLabel(candidates[0]?.weaponId ?? null) ?? "?"),
		)
		.join(" | ");
}

/** one team's four icons as ✕ splatted / ★ special ready / · alive */
function formatPlayerStatusSide(data: PlayerStatusData, side: 0 | 1): string {
	return data.dead[side]
		.map((dead, slot) => (dead ? "✕" : data.special[side][slot] ? "★" : "·"))
		.join("");
}

function formatPlayers(data: ScoreboardData): string {
	return data.players
		.map(
			(p, i) =>
				`${i < 4 ? "W" : "L"} ${p.name} · ${p.weaponId ?? "?"} · ${p.paint ?? "?"}p ` +
				`${p.ka ?? "?"}/${p.d ?? "?"}/${p.s ?? "?"}`,
		)
		.join("; ");
}

function eventCells(event: CsvEvent): Cell[] {
	const base: Cell[] = [
		event.type,
		formatTime(event.t),
		Math.round(event.t * 1000) / 1000,
		event.detectedAt === undefined
			? ""
			: new Date(event.detectedAt).toISOString(),
		Math.round(event.confidence * 1000) / 1000,
	];
	switch (event.type) {
		case DEATH_EVENT_TYPE: {
			const d = event.data as DeathData;
			return [
				...base,
				"",
				"",
				"",
				"",
				"",
				"",
				weaponLabel(d.weaponType, d.weaponId),
				d.name,
				formatAbilities(d.abilities),
				"",
				"",
				"",
			];
		}
		case MAP_START_EVENT_TYPE: {
			const d = event.data as MapStartData;
			return [
				...base,
				"",
				modeLabel(d.mode),
				stageLabel(d.stage),
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
			];
		}
		case SCOREBOARD_OWN_EVENT_TYPE: {
			const d = event.data as ScoreboardOwnData;
			return [
				...base,
				lobbyLabel(d.lobby),
				modeLabel(d.mode),
				stageLabel(d.stage),
				"",
				"",
				"",
				mainWeaponLabel(d.weaponId),
				"",
				formatAbilities(d.abilities),
				"",
				"",
				"",
			];
		}
		case OBJECTIVE_EVENT_TYPE: {
			const d = event.data as ObjectiveData;
			const sideText = (side: 0 | 1) =>
				`${d.score[side] ?? "?"}${d.penalty[side] !== null ? ` (+${d.penalty[side]})` : ""}${d.control[side] ? " ctrl" : ""}`;
			const clock = d.time === null ? "" : `${formatClock(d.time)} · `;
			return [
				...base,
				"",
				modeLabel(d.mode),
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				`${clock}${sideText(0)} vs ${sideText(1)}`,
				"",
				"",
			];
		}
		case MINIMAP_EVENT_TYPE: {
			const d = event.data as MinimapData;
			const self = d.teammates.find((p) => p.slot === "self");
			return [
				...base,
				"", // lobby
				"", // mode (not readable from the minimap)
				stageLabel(d.stage), // stage (planner-signature match)
				"", // winner_score
				"", // loser_score
				self?.name,
				self ? mainWeaponLabel(self.weaponId) : "",
				"",
				self ? formatMinimapAbilities(self.abilities) : "",
				formatMinimapPlayers(d),
				"",
				"",
			];
		}
		case PLAYER_STATUS_EVENT_TYPE: {
			const d = event.data as PlayerStatusData;
			const clock = d.time === null ? "" : `${formatClock(d.time)} · `;
			return [
				...base,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				`${clock}${formatPlayerStatusSide(d, 0)} vs ${formatPlayerStatusSide(d, 1)} (${d.layout})`,
				"",
				"",
			];
		}
		case STRIP_WEAPONS_EVENT_TYPE: {
			const d = event.data as StripWeaponsData;
			const clock = d.time === null ? "" : `${formatClock(d.time)} · `;
			return [
				...base,
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				"",
				`${clock}${formatStripWeaponsSide(d, 0)} vs ${formatStripWeaponsSide(d, 1)} (${d.layout})`,
				"",
				"",
			];
		}
		case SCOREBOARD_EVENT_TYPE:
		case SCOREBOARD_BATTLE_LOG_EVENT_TYPE:
		case SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE: {
			// the three scoreboard reads share the base shape
			const d = event.data as ScoreboardData &
				Partial<ScoreboardBattleLogReplayData>;
			return [
				...base,
				lobbyLabel(d.lobby),
				modeLabel(d.mode),
				stageLabel(d.stage),
				d.matchScores[0],
				d.matchScores[1],
				d.povIndex === null ? "" : d.players[d.povIndex]?.name,
				"",
				"",
				"",
				formatPlayers(d),
				d.replayCode ?? "",
				d.timestamp ?? "",
			];
		}
		default:
			return [...base, ...Array(HEADER.length - base.length).fill("")];
	}
}

export function eventsToCsv(events: CsvEvent[]): string {
	const lines = [HEADER.join(",")];
	for (const event of events)
		lines.push(eventCells(event).map(csvCell).join(","));
	return `${lines.join("\r\n")}\r\n`;
}

export function downloadEventsCsv(filename: string, events: CsvEvent[]): void {
	const blob = new Blob([eventsToCsv(events)], { type: "text/csv" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}
