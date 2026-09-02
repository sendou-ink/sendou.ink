/**
 * TimelineBuilder: same-type events within a merge window collapse into one
 * (highest confidence kept); events below a confidence floor are dropped.
 */

import {
	MINIMAP_EVENT_TYPE,
	sameMinimapStatusData,
} from "../detectors/minimap/index";
import {
	OBJECTIVE_EVENT_TYPE,
	sameObjectiveData,
} from "../detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	samePlayerStatusData,
} from "../detectors/objective/player-status";
import { STRIP_WEAPONS_EVENT_TYPE } from "../detectors/objective/strip-weapons";
import { SCOREBOARD_EVENT_TYPE } from "../detectors/scoreboard/index";
import { SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../detectors/scoreboard-battle-log/index";
import { SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE } from "../detectors/scoreboard-battle-log-replay/index";
import type { DetectedEvent } from "../detectors/types";
import { sameScoreboardMatch } from "./same-scoreboard";

export interface TimelineOptions {
	/** same-type events closer than this (seconds) merge */
	mergeWindow: number;
	/** per-type overrides: repeatable events need a window shorter than the spacing between two real occurrences */
	mergeWindowByType: Record<string, number>;
	/**
	 * per-type content guard: same-type events inside the window merge only when
	 * this returns true for their data — screens whose distinct occurrences can
	 * appear seconds apart (replay browsing) need content, not time, to split.
	 */
	sameEventDataByType: Record<string, (a: unknown, b: unknown) => boolean>;
	/** events below this confidence are dropped */
	minConfidence: number;
	/** per-type floor overrides: evidence events scored on a different scale (raw NCC peaks) opt out of the shared floor */
	minConfidenceByType: Record<string, number>;
}

const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
	mergeWindow: 30,
	// Death: the overlay shows ~5s and respawn takes ~8.5s, so repeat frames of
	// one death land inside while consecutive deaths fall outside. Minimap:
	// players flick the map open for 1-3s and each open is a fresh sample, so
	// frames merge only within one open (a mid-open dead/special flip stays its
	// own event via the content guard). Objective: reads repeat every second; the
	// content guard keeps every change while static stretches collapse.
	// PlayerStatus: a state can recur no sooner than a respawn (~9s), so the
	// window stays under that. StripWeapons: sampled every ~5s, each distinct evidence
	mergeWindowByType: {
		Death: 8,
		[MINIMAP_EVENT_TYPE]: 5,
		[OBJECTIVE_EVENT_TYPE]: 10,
		[PLAYER_STATUS_EVENT_TYPE]: 5,
		[STRIP_WEAPONS_EVENT_TYPE]: 2,
	},
	sameEventDataByType: {
		[SCOREBOARD_EVENT_TYPE]: sameScoreboardMatch,
		[SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE]: sameScoreboardMatch,
		[SCOREBOARD_BATTLE_LOG_EVENT_TYPE]: sameScoreboardMatch,
		[MINIMAP_EVENT_TYPE]: sameMinimapStatusData,
		[OBJECTIVE_EVENT_TYPE]: sameObjectiveData,
		[PLAYER_STATUS_EVENT_TYPE]: samePlayerStatusData,
	},
	minConfidence: 0.6,
	minConfidenceByType: {
		[STRIP_WEAPONS_EVENT_TYPE]: 0,
	},
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
		const minConfidence =
			this.#options.minConfidenceByType[event.type] ??
			this.#options.minConfidence;
		if (event.confidence < minConfidence) {
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
