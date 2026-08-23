/**
 * "Save as fixture": download the raw captured frame as PNG plus an
 * expected.json prefilled from the detector's own output, so labeling a new
 * fixture is review-and-correct instead of data entry.
 */

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
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type { ScoreboardBattleLogReplayData } from "../core/detectors/scoreboard-battle-log-replay/index";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
import { mainWeaponLabel, stageLabel, weaponLabel } from "./labels";

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
	| StripWeaponsData;

function isDeath(_data: FixtureData, eventType: string): _data is DeathData {
	return eventType === DEATH_EVENT_TYPE;
}

function download(name: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	URL.revokeObjectURL(url);
}

function buildExpectedJson(
	data: FixtureData | null,
	eventType = "Scoreboard",
): string {
	if (!data) {
		return `${JSON.stringify({ event: "none" }, null, 2)}\n`;
	}
	if (isDeath(data, eventType)) {
		const label = weaponLabel(data.weaponType, data.weaponId);
		return `${JSON.stringify(
			{
				event: eventType,
				data: {
					...(label !== null && { weaponLabel: label }),
					...(data.weaponId !== null && { weaponId: data.weaponId }),
					...(data.weaponType !== null && { weaponType: data.weaponType }),
					abilities: data.abilities,
					...(data.name !== null && { name: data.name }),
				},
			},
			null,
			2,
		)}\n`;
	}
	if (eventType === SCOREBOARD_OWN_EVENT_TYPE) {
		const own = data as ScoreboardOwnData;
		return `${JSON.stringify(
			{
				event: eventType,
				data: {
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
				},
			},
			null,
			2,
		)}\n`;
	}
	if (eventType === MINIMAP_EVENT_TYPE) {
		const minimap = data as MinimapData;
		return `${JSON.stringify(
			{
				event: eventType,
				data: {
					...(minimap.stage !== null && {
						stage: minimap.stage,
						stageLabel: stageLabel(minimap.stage),
					}),
					...(minimap.spectator && { spectator: true }),
					teammates: minimap.teammates.map((p) => ({
						slot: p.slot,
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
				},
			},
			null,
			2,
		)}\n`;
	}
	if (eventType === OBJECTIVE_EVENT_TYPE) {
		const objective = data as ObjectiveData;
		return `${JSON.stringify(
			{
				event: eventType,
				data: {
					mode: objective.mode,
					time: objective.time,
					score: objective.score,
					penalty: objective.penalty,
					control: objective.control,
				},
			},
			null,
			2,
		)}\n`;
	}
	if (eventType === PLAYER_STATUS_EVENT_TYPE) {
		const status = data as PlayerStatusData;
		return `${JSON.stringify(
			{
				event: eventType,
				data: {
					layout: status.layout,
					cast: status.cast,
					time: status.time,
					special: status.special,
					dead: status.dead,
				},
			},
			null,
			2,
		)}\n`;
	}
	if (eventType === STRIP_WEAPONS_EVENT_TYPE) {
		const strip = data as StripWeaponsData;
		return `${JSON.stringify(
			{
				event: eventType,
				data: {
					layout: strip.layout,
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
				},
			},
			null,
			2,
		)}\n`;
	}
	// NB: not a type-predicate helper — CardData is structurally assignable to
	// MapStartData, so a predicate would narrow the fall-through case to never
	if (eventType === MAP_START_EVENT_TYPE) {
		const mapStart = data as MapStartData;
		return `${JSON.stringify(
			{
				event: eventType,
				data: {
					...(mapStart.mode !== null && { mode: mapStart.mode }),
					...(mapStart.stage !== null && {
						stage: mapStart.stage,
						stageLabel: stageLabel(mapStart.stage),
					}),
				},
			},
			null,
			2,
		)}\n`;
	}
	const card = data as CardData;
	return `${JSON.stringify(
		{
			event: eventType,
			data: {
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
			},
		},
		null,
		2,
	)}\n`;
}

/**
 * expected.json alone, for a frame the user already has on disk (Screenshot
 * page). Null data produces the negative-fixture form.
 */
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

/**
 * Fixture export for a live detection: the stored PNG is the byte-exact
 * frame the detector analyzed, paired with that event's own parse output.
 */
export function saveFixtureFromEvent(
	frame: Blob,
	data: FixtureData,
	eventType: string,
): void {
	download("frame.png", frame);
	download(
		"expected.json",
		new Blob([buildExpectedJson(data, eventType)], {
			type: "application/json",
		}),
	);
}

export async function saveFixture(
	video: HTMLVideoElement,
	latest: { type: string; data: FixtureData } | null,
): Promise<void> {
	const canvas = document.createElement("canvas");
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	canvas.getContext("2d")!.drawImage(video, 0, 0);
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/png"),
	);
	if (!blob) throw new Error("could not encode frame");
	download("frame.png", blob);
	download(
		"expected.json",
		new Blob([buildExpectedJson(latest?.data ?? null, latest?.type)], {
			type: "application/json",
		}),
	);
}
