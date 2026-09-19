/**
 * Single dispatch point from a detected event to its card (the debug "raw
 * detections" of a match). Frames load lazily through `getFrame` (IndexedDB
 * keeps them out of the listed records); the Inspect action (open the frame
 * in the debug view in a new tab, leaving the running scan undisturbed) is
 * derived from it here.
 */

import { SCANNER_PAGE } from "~/utils/urls";
import type { PlayerAbilityMap } from "../core/ability-harvest";
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
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import {
	SCOREBOARD_OWN_EVENT_TYPE,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
import { scannerSearchParams } from "../scanner-search-params";
import { newInspectKey, putInspectFrame } from "../store/inspect";
import { DeathCard } from "./DeathCard";
import type { FixtureData } from "./fixture-export";
import { KillCard } from "./KillCard";
import { MapStartCard } from "./MapStartCard";
import { MinimapCard } from "./MinimapCard";
import { ObjectiveCard } from "./ObjectiveCard";
import { PlayerStatusCard } from "./PlayerStatusCard";
import { ScoreboardCard } from "./ScoreboardCard";
import { ScoreboardOwnCard } from "./ScoreboardOwnCard";
import { StripWeaponsCard } from "./StripWeaponsCard";

export type GetFrame = () => Promise<Blob | null | undefined>;

export function EventCard(props: {
	type: string;
	t: number;
	confidence: number;
	data: FixtureData;
	thumbnail?: string;
	detectedAt?: number;
	/** lazy loader for the exact analyzed frame; enables Inspect + fixture export */
	getFrame?: GetFrame;
	/** Scoreboard only: abilities harvested from the match's death events */
	abilities?: PlayerAbilityMap;
}) {
	const { type, t, confidence, data, thumbnail, detectedAt, getFrame } = props;
	// window.open must run synchronously in the click gesture (popup blockers);
	// the frame write catches up and the new tab polls for it
	const onInspect = getFrame
		? () => {
				const key = newInspectKey();
				window.open(
					scannerSearchParams.href(SCANNER_PAGE, {
						view: "debug",
						inspect: key,
					}),
					"_blank",
				);
				void getFrame().then((frame) => {
					if (frame) void putInspectFrame(key, frame);
				});
			}
		: undefined;
	const shared = { t, confidence, thumbnail, detectedAt, getFrame, onInspect };

	return renderCard(type, data, shared, props.abilities);
}

function renderCard(
	type: string,
	data: FixtureData,
	shared: {
		t: number;
		confidence: number;
		thumbnail?: string;
		detectedAt?: number;
		getFrame?: GetFrame;
		onInspect?: () => void;
	},
	abilities?: PlayerAbilityMap,
) {
	return type === DEATH_EVENT_TYPE ? (
		<DeathCard {...shared} data={data as DeathData} />
	) : type === KILL_EVENT_TYPE ? (
		<KillCard {...shared} data={data as KillData} />
	) : type === MAP_START_EVENT_TYPE ? (
		<MapStartCard {...shared} data={data as MapStartData} />
	) : type === SCOREBOARD_OWN_EVENT_TYPE ? (
		<ScoreboardOwnCard {...shared} data={data as ScoreboardOwnData} />
	) : type === MINIMAP_EVENT_TYPE ? (
		<MinimapCard {...shared} data={data as MinimapData} />
	) : type === OBJECTIVE_EVENT_TYPE ? (
		<ObjectiveCard {...shared} data={data as ObjectiveData} />
	) : type === PLAYER_STATUS_EVENT_TYPE ? (
		<PlayerStatusCard {...shared} data={data as PlayerStatusData} />
	) : type === STRIP_WEAPONS_EVENT_TYPE ? (
		<StripWeaponsCard {...shared} data={data as StripWeaponsData} />
	) : (
		<ScoreboardCard
			{...shared}
			eventType={type}
			data={data as ScoreboardData}
			abilities={abilities}
		/>
	);
}
