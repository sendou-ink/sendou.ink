/**
 * Fixture downloads: the raw captured frame as PNG, and for a detection an
 * expected.json prefilled from the detector's output, so labeling is review-and-correct.
 */

import { downloadBlob as download } from "~/utils/download";
import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import { KILL_EVENT_TYPE } from "../core/detectors/kill/index";
import { MAP_START_EVENT_TYPE } from "../core/detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "../core/detectors/minimap/index";
import { OBJECTIVE_EVENT_TYPE } from "../core/detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	statusFlagsOf,
} from "../core/detectors/objective/player-status";
import { STRIP_WEAPONS_EVENT_TYPE } from "../core/detectors/objective/strip-weapons";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type { ScoreboardBattleLogReplayData } from "../core/detectors/scoreboard-battle-log-replay/index";
import { SCOREBOARD_OWN_EVENT_TYPE } from "../core/detectors/scoreboard-own/index";
import { type DetectedEvent, isXBattleCardEvent } from "../core/events";
import { mainWeaponLabel, stageLabel, weaponLabel } from "../core/labels";

/** Scoreboard data with the replay extras present when the event has them. */
type CardData = ScoreboardData &
	Partial<Pick<ScoreboardBattleLogReplayData, "timestamp" | "replayCode">>;

/** A detection's expected.json, prefilled from the detector's output. Null = negative-fixture form. */
export function buildExpectedJson(event: DetectedEvent | null): string {
	if (!event) {
		return `${JSON.stringify({ event: "none" }, null, 2)}\n`;
	}
	// the X Battle cards' data is already in its fixture form
	if (isXBattleCardEvent(event)) {
		return `${JSON.stringify({ event: event.type, data: event.data }, null, 2)}\n`;
	}
	if (event.type === DEATH_EVENT_TYPE) {
		const { data } = event;
		const label = weaponLabel(data.weaponType, data.weaponId);
		return `${JSON.stringify(
			{
				event: event.type,
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
	if (event.type === SCOREBOARD_OWN_EVENT_TYPE) {
		const own = event.data;
		return `${JSON.stringify(
			{
				event: event.type,
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
	if (event.type === MINIMAP_EVENT_TYPE) {
		const minimap = event.data;
		return `${JSON.stringify(
			{
				event: event.type,
				data: {
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
				},
			},
			null,
			2,
		)}\n`;
	}
	if (event.type === OBJECTIVE_EVENT_TYPE) {
		const objective = event.data;
		return `${JSON.stringify(
			{
				event: event.type,
				data:
					objective.mode === "SZ"
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
							},
			},
			null,
			2,
		)}\n`;
	}
	if (event.type === PLAYER_STATUS_EVENT_TYPE) {
		const status = event.data;
		const flags = statusFlagsOf(status);
		return `${JSON.stringify(
			{
				event: event.type,
				data: {
					cast: status.cast,
					time: status.time,
					special: flags.special,
					dead: flags.dead,
				},
			},
			null,
			2,
		)}\n`;
	}
	if (event.type === STRIP_WEAPONS_EVENT_TYPE) {
		const strip = event.data;
		return `${JSON.stringify(
			{
				event: event.type,
				data: {
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
	if (event.type === KILL_EVENT_TYPE) {
		const kill = event.data;
		return `${JSON.stringify(
			{ event: event.type, data: { time: kill.time, names: kill.names } },
			null,
			2,
		)}\n`;
	}
	if (event.type === MAP_START_EVENT_TYPE) {
		const mapStart = event.data;
		return `${JSON.stringify(
			{
				event: event.type,
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
	const card: CardData = event.data;
	return `${JSON.stringify(
		{
			event: event.type,
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

/** expected.json alone, for a frame already on disk (Screenshot page). Null = negative-fixture form. */
export function downloadExpectedJson(event: DetectedEvent | null): void {
	download(
		"expected.json",
		new Blob([buildExpectedJson(event)], {
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
