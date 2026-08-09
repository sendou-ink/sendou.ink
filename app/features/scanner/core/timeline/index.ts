/**
 * TimelineBuilder: minimal event stream cleanup for the POC.
 * Same-type events within a merge window collapse into one, keeping the
 * highest-confidence version; events below a confidence floor are dropped.
 */

import {
	OBJECTIVE_EVENT_TYPE,
	sameObjectiveData,
} from "../detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	samePlayerStatusData,
} from "../detectors/objective/player-status";
import { SCOREBOARD_EVENT_TYPE } from "../detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../detectors/scoreboard-battle-log/index";
import { SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE } from "../detectors/scoreboard-battle-log-replay/index";
import type { DetectedEvent } from "../detectors/types";
import { sameScoreboardMatch } from "./same-scoreboard";

export interface TimelineOptions {
	/** same-type events closer than this (seconds) merge */
	mergeWindow: number;
	/**
	 * per-type mergeWindow overrides: repeatable events need a window shorter
	 * than the minimum spacing between two real occurrences
	 */
	mergeWindowByType: Record<string, number>;
	/**
	 * per-type content guard: same-type events inside the window merge only
	 * when this returns true for their data — screens whose distinct real
	 * occurrences can appear seconds apart (replay browsing) need content,
	 * not time, to tell them apart. Absent = merge on time alone.
	 */
	sameEventDataByType: Record<string, (a: unknown, b: unknown) => boolean>;
	/** events below this confidence are dropped */
	minConfidence: number;
}

const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
	mergeWindow: 30,
	// the death screen shows for ~5s and respawn takes ~8.5s, so repeat frames
	// of one death land within the window while consecutive deaths are outside;
	// players flick the map open for 1-3s and each open is a fresh sample
	// (slots read differently across opens), so minimap frames merge only
	// within one open
	// objective counter reads repeat every check second; the content guard
	// below keeps every actual change while the window collapses static
	// stretches into one event per state. Player statuses can revisit an
	// exact prior state no sooner than a respawn takes (~9s), so their
	// window must stay under that
	mergeWindowByType: {
		Death: 8,
		Minimap: 5,
		[OBJECTIVE_EVENT_TYPE]: 10,
		[PLAYER_STATUS_EVENT_TYPE]: 5,
	},
	sameEventDataByType: {
		[SCOREBOARD_EVENT_TYPE]: sameScoreboardMatch,
		[SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE]: sameScoreboardMatch,
		[SCOREBOARD_BATTLE_LOG_EVENT_TYPE]: sameScoreboardMatch,
		[OBJECTIVE_EVENT_TYPE]: sameObjectiveData,
		[PLAYER_STATUS_EVENT_TYPE]: samePlayerStatusData,
	},
	minConfidence: 0.6,
};

export type TimelineAction =
	| { action: "added"; event: DetectedEvent }
	| { action: "replaced"; event: DetectedEvent; replaced: DetectedEvent }
	| { action: "merged"; into: DetectedEvent }
	| { action: "dropped"; reason: "low-confidence" };

export class TimelineBuilder {
	#events: DetectedEvent[] = [];
	#options: TimelineOptions;

	constructor(options: Partial<TimelineOptions> = {}) {
		this.#options = { ...DEFAULT_TIMELINE_OPTIONS, ...options };
	}

	get events(): readonly DetectedEvent[] {
		return this.#events;
	}

	push(event: DetectedEvent): TimelineAction {
		if (event.confidence < this.#options.minConfidence) {
			return { action: "dropped", reason: "low-confidence" };
		}
		const window =
			this.#options.mergeWindowByType[event.type] ?? this.#options.mergeWindow;
		const same = this.#options.sameEventDataByType[event.type];
		const near = this.#events.find(
			(e) =>
				e.type === event.type &&
				Math.abs(e.t - event.t) <= window &&
				(same?.(e.data, event.data) ?? true),
		);
		if (!near) {
			this.#events.push(event);
			this.#events.sort((a, b) => a.t - b.t);
			return { action: "added", event };
		}
		if (event.confidence > near.confidence) {
			this.#events[this.#events.indexOf(near)] = event;
			this.#events.sort((a, b) => a.t - b.t);
			return { action: "replaced", event, replaced: near };
		}
		return { action: "merged", into: near };
	}
}
