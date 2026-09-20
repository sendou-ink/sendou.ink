/**
 * "Raw detections" export: one row per detected event. Types share columns
 * where they overlap, and a scoreboard's eight player rows (or the minimap's
 * cards, or the objective HUD's icon strip) pack into one cell. Positions are
 * reported relative to `originT` (a live session's first event, 0 for a file).
 */

import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { DEATH_EVENT_TYPE, type DeathData } from "../detectors/death/index";
import { KILL_EVENT_TYPE, type KillData } from "../detectors/kill/index";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../detectors/map-start/index";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
} from "../detectors/minimap/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "../detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
} from "../detectors/objective/player-status";
import {
	STRIP_WEAPONS_EVENT_TYPE,
	type StripWeaponsData,
} from "../detectors/objective/strip-weapons";
import { QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../detectors/quick-scoreboard-battle-log/index";
import {
	SCOREBOARD_EVENT_TYPE,
	type ScoreboardData,
} from "../detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../detectors/scoreboard-battle-log/index";
import {
	SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE,
	type ScoreboardBattleLogReplayData,
} from "../detectors/scoreboard-battle-log-replay/index";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../detectors/scoreboard-own/index";
import { formatClock, formatTime } from "../format";
import {
	lobbyLabel,
	mainWeaponLabel,
	modeLabel,
	stageLabel,
	weaponLabel,
} from "../labels";
import { type CsvCell, toCsv } from "./csv";

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

export function eventsToCsv(events: readonly CsvEvent[], originT = 0): string {
	return toCsv(
		HEADER,
		events.map((event) => eventCells(event, originT)),
	);
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
		...data.teammates.map((p, i) => fmt(p.self ? "self" : `ally${i + 1}`, p)),
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

function eventCells(event: CsvEvent, originT: number): CsvCell[] {
	const t = event.t - originT;
	const base: CsvCell[] = [
		event.type,
		formatTime(t),
		Math.round(t * 1000) / 1000,
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
		case KILL_EVENT_TYPE: {
			const d = event.data as KillData;
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
				// oldest first, the order the splats happened
				`${clock}${d.names
					.toReversed()
					.map((name) => name ?? "?")
					.join(" | ")}`,
				"",
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
			const self = d.teammates.find((p) => p.self);
			return [
				...base,
				"",
				"",
				stageLabel(d.stage),
				"",
				"",
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
		case QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE:
		case SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE: {
			// the scoreboard reads share the base shape
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
