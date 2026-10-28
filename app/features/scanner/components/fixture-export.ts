/**
 * Fixture downloads: the raw captured frame as PNG, and for a detection an
 * expected.json prefilled from the detector's output, so labeling is review-and-correct.
 */

import { downloadBlob as download } from "~/utils/download";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import { KILL_EVENT_TYPE, type KillData } from "../core/detectors/kill/index";
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
import type { ScoreboardBattleLogReplayData } from "../core/detectors/scoreboard-battle-log-replay/index";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import {
	X_RANK_POSITION_EVENT_TYPE,
	type XRankPositionData,
} from "../core/detectors/x-rank/position";
import {
	X_SET_COUNT_EVENT_TYPE,
	type XSetCountData,
} from "../core/detectors/x-rank/set-count";
import {
	X_SET_RESULT_EVENT_TYPE,
	type XSetResultData,
} from "../core/detectors/x-rank/set-result";
import { mainWeaponLabel, stageLabel, weaponLabel } from "../core/labels";

/** Scoreboard data with the replay extras present when the event has them. */
export type CardData = ScoreboardData &
	Partial<Pick<ScoreboardBattleLogReplayData, "timestamp" | "replayCode">>;

/** Any detector's event payload that can prefill a fixture. */
export type FixtureData =
	| CardData
	| DeathData
	| MapStartData
	| ScoreboardOwnData
	| MinimapData
	| ObjectiveData
	| PlayerStatusData
	| StripWeaponsData
	| KillData
	| XSetCountData
	| XSetResultData
	| XRankPositionData;

/** The X Battle cards' data is already in its fixture form. */
const AS_IS_EVENT_TYPES: readonly string[] = [
	X_SET_COUNT_EVENT_TYPE,
	X_SET_RESULT_EVENT_TYPE,
	X_RANK_POSITION_EVENT_TYPE,
];

function isDeath(_data: FixtureData, eventType: string): _data is DeathData {
	return eventType === DEATH_EVENT_TYPE;
}

/** A detection's expected.json, prefilled from the detector's output. Null data = negative-fixture form. */
export function buildExpectedJson(
	data: FixtureData | null,
	eventType = "Scoreboard",
): string {
	if (!data) {
		return fixtureJson({ event: "none" });
	}
	return fixtureJson({
		event: eventType,
		data: expectedFixtureData(data, eventType),
	});
}

/** expected.json alone, for a frame already on disk (Screenshot page). Null data = negative-fixture form. */
export function downloadExpectedJson(
	data: FixtureData | null,
	eventType?: string,
): void {
	download(
		"expected.json",
		new Blob([buildExpectedJson(data, eventType)], {
			type: "application/json",
		}),
	);
}

/** The video's current frame as frame.png, the fixture's raw input. */
export async function saveFrame(video: HTMLVideoElement): Promise<void> {
	const canvas = document.createElement("canvas");
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	canvas.getContext("2d")!.drawImage(video, 0, 0);
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/png"),
	);
	if (!blob) throw new Error("could not encode frame");
	download("frame.png", blob);
}

function fixtureJson(value: unknown): string {
	return `${JSON.stringify(value, null, 2)}\n`;
}

function expectedFixtureData(data: FixtureData, eventType: string): unknown {
	if (AS_IS_EVENT_TYPES.includes(eventType)) return data;
	if (isDeath(data, eventType)) return deathFixtureData(data);
	if (eventType === SCOREBOARD_OWN_EVENT_TYPE) {
		return ownResultsFixtureData(data as ScoreboardOwnData);
	}
	if (eventType === MINIMAP_EVENT_TYPE) {
		return minimapFixtureData(data as MinimapData);
	}
	if (eventType === OBJECTIVE_EVENT_TYPE) {
		return objectiveFixtureData(data as ObjectiveData);
	}
	if (eventType === PLAYER_STATUS_EVENT_TYPE) {
		const status = data as PlayerStatusData;
		return {
			cast: status.cast,
			time: status.time,
			special: status.special,
			dead: status.dead,
		};
	}
	if (eventType === STRIP_WEAPONS_EVENT_TYPE) {
		return stripWeaponsFixtureData(data as StripWeaponsData);
	}
	if (eventType === KILL_EVENT_TYPE) {
		const kill = data as KillData;
		return { time: kill.time, names: kill.names };
	}
	// NB: not a type-predicate helper — CardData is structurally assignable to
	// MapStartData, so a predicate would narrow the fall-through case to never
	if (eventType === MAP_START_EVENT_TYPE) {
		return mapStartFixtureData(data as MapStartData);
	}
	return cardFixtureData(data as CardData);
}

function deathFixtureData(data: DeathData) {
	const label = weaponLabel(data.weaponType, data.weaponId);
	return {
		...(label !== null && { weaponLabel: label }),
		...(data.weaponId !== null && { weaponId: data.weaponId }),
		...(data.weaponType !== null && { weaponType: data.weaponType }),
		abilities: data.abilities,
		...(data.name !== null && { name: data.name }),
	};
}

function ownResultsFixtureData(own: ScoreboardOwnData) {
	return {
		...(own.lobby !== null && { lobby: own.lobby }),
		...(own.mode !== null && { mode: own.mode }),
		...(own.stage !== null && {
			stage: own.stage,
			stageLabel: stageLabel(own.stage),
		}),
		...(own.weaponId !== null && {
			weaponLabel: mainWeaponLabel(own.weaponId),
			weaponId: own.weaponId,
		}),
		abilities: own.abilities,
	};
}

function minimapFixtureData(minimap: MinimapData) {
	return {
		...(minimap.stage !== null && {
			stage: minimap.stage,
			stageLabel: stageLabel(minimap.stage),
		}),
		...(minimap.spectator && { spectator: true }),
		teammates: minimap.teammates.map((p) => ({
			self: p.self,
			name: p.name,
			weaponLabel: mainWeaponLabel(p.weaponId),
			weaponId: p.weaponId,
			abilities: p.abilities,
			dead: p.dead,
			specialReady: p.specialReady,
		})),
		enemies: minimap.enemies.map((p) => ({
			...(minimap.spectator && { name: p.name }),
			weaponLabel: mainWeaponLabel(p.weaponId),
			weaponId: p.weaponId,
			abilities: p.abilities,
			dead: p.dead,
			specialReady: p.specialReady,
		})),
	};
}

function objectiveFixtureData(objective: ObjectiveData) {
	return objective.mode === "SZ"
		? {
				mode: objective.mode,
				time: objective.time,
				score: objective.score,
				penalty: objective.penalty,
				control: objective.control,
			}
		: {
				mode: objective.mode,
				time: objective.time,
				score: objective.score,
				control: objective.control,
				position: objective.position,
			};
}

function stripWeaponsFixtureData(strip: StripWeaponsData) {
	return {
		time: strip.time,
		// the top candidate per slot; hand-correct to the true weapons
		weapons: strip.slots.map((side) =>
			side.map((candidates) => candidates?.[0]?.weaponId ?? null),
		),
		weaponLabels: strip.slots.map((side) =>
			side.map((candidates) =>
				mainWeaponLabel(candidates?.[0]?.weaponId ?? null),
			),
		),
	};
}

function mapStartFixtureData(mapStart: MapStartData) {
	return {
		...(mapStart.mode !== null && { mode: mapStart.mode }),
		...(mapStart.stage !== null && {
			stage: mapStart.stage,
			stageLabel: stageLabel(mapStart.stage),
		}),
	};
}

function cardFixtureData(card: CardData) {
	return {
		...(card.lobby !== null && { lobby: card.lobby }),
		...(card.mode !== null && { mode: card.mode }),
		...(card.stage !== null && {
			stage: card.stage,
			stageLabel: stageLabel(card.stage),
		}),
		...(card.timestamp != null && { timestamp: card.timestamp }),
		...(card.replayCode != null && { replayCode: card.replayCode }),
		matchScores: card.matchScores,
		players: card.players.map((p) => ({
			name: p.name,
			weaponId: p.weaponId,
			paint: p.paint,
			ka: p.ka,
			d: p.d,
			s: p.s,
		})),
	};
}
