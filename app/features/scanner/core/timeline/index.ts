/**
 * TimelineBuilder: same-type events within a merge window collapse into one
 * (highest confidence kept); events below a confidence floor are dropped.
 * Sampled types (per-frame state reads) keep the ends of every same-state run
 * instead, see `sampledTypes`.
 */

import { KILL_EVENT_TYPE, sameKillData } from "../detectors/kill/index";
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
import { QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE } from "../detectors/quick-scoreboard-battle-log/index";
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
	/**
	 * per-frame state samples, where every read carries state at its instant
	 * and a run of same-state reads is a series rather than one repeated
	 * screen. Instead of collapsing the run into its first read, the builder
	 * keeps that first read, the latest read (re-placed as the run grows —
	 * `extended`) and one read per merge window in between, so the run's ends
	 * are exact and a lone misread stays flanked by the reads either side of
	 * it for the match builder's smoothing. Confidence never moves a sample.
	 */
	sampledTypes: readonly string[];
}

const DEFAULT_TIMELINE_OPTIONS: TimelineOptions = {
	mergeWindow: 30,
	// Death: the overlay shows ~5s and respawn takes ~8.5s, so repeat frames of
	// one death land inside while consecutive deaths fall outside. Minimap:
	// players flick the map open for 1-3s and each open is a fresh sample, so
	// frames merge only within one open (a mid-open dead/special flip stays its
	// own event via the content guard). Objective: reads repeat every second; the
	// content guard keeps every change while static stretches collapse.
	// PlayerStatus: sampled (see `sampledTypes`); the window is how often a
	// standing state is re-confirmed, under the renderer's 15s unknown-gap rule.
	// StripWeapons: sampled every ~5s, each distinct evidence.
	// Kill: the same stack re-read while it shows merges; a splatted player
	// can't re-enter the feed before respawning (~8.5s), so the window stays
	// under that and the content guard splits a growing stack.
	mergeWindowByType: {
		Death: 8,
		[MINIMAP_EVENT_TYPE]: 5,
		[OBJECTIVE_EVENT_TYPE]: 10,
		[PLAYER_STATUS_EVENT_TYPE]: 5,
		[STRIP_WEAPONS_EVENT_TYPE]: 2,
		[KILL_EVENT_TYPE]: 8,
	},
	sameEventDataByType: {
		[SCOREBOARD_EVENT_TYPE]: sameScoreboardMatch,
		[SCOREBOARD_BATTLE_LOG_REPLAY_EVENT_TYPE]: sameScoreboardMatch,
		[SCOREBOARD_BATTLE_LOG_EVENT_TYPE]: sameScoreboardMatch,
		[QUICK_SCOREBOARD_BATTLE_LOG_EVENT_TYPE]: sameScoreboardMatch,
		[MINIMAP_EVENT_TYPE]: sameMinimapStatusData,
		[OBJECTIVE_EVENT_TYPE]: sameObjectiveData,
		[PLAYER_STATUS_EVENT_TYPE]: samePlayerStatusData,
		[KILL_EVENT_TYPE]: sameKillData,
	},
	minConfidence: 0.6,
	minConfidenceByType: {
		[STRIP_WEAPONS_EVENT_TYPE]: 0,
	},
	sampledTypes: [PLAYER_STATUS_EVENT_TYPE],
};

export type TimelineAction =
	| { action: "added"; event: DetectedEvent }
	| { action: "replaced"; event: DetectedEvent; replaced: DetectedEvent }
	/** a sampled run's trailing read moved forward: same stored slot, no new frame worth keeping */
	| { action: "extended"; event: DetectedEvent; replaced: DetectedEvent }
	| { action: "merged"; into: DetectedEvent }
	| { action: "dropped"; reason: "low-confidence" };

export class TimelineBuilder {
	readonly #events: DetectedEvent[] = [];
	readonly #options: TimelineOptions;

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
		if (this.#options.sampledTypes.includes(event.type)) {
			return this.#pushSample(event, window, same);
		}
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

	/**
	 * Same-state neighbours (by `t`) decide a sample's fate: none within the
	 * window → added; already bracketed by two → merged (a late-arriving VoD
	 * read); following the run's trailing read while the kept read before it is
	 * still within the window → extends, replacing that trailing read; otherwise
	 * added as the run's new trailing read.
	 */
	#pushSample(
		event: DetectedEvent,
		window: number,
		same: ((a: unknown, b: unknown) => boolean) | undefined,
	): TimelineAction {
		const continues = (earlier: DetectedEvent, later: DetectedEvent) =>
			later.t - earlier.t <= window &&
			(same?.(earlier.data, later.data) ?? true);
		const sameType = this.#events.filter((e) => e.type === event.type);
		const nextIndex = sameType.findIndex((e) => e.t > event.t);
		const before = nextIndex === -1 ? sameType : sameType.slice(0, nextIndex);
		const next = nextIndex === -1 ? undefined : sameType[nextIndex];
		const prev = before.at(-1);
		const kept = before.at(-2);
		if (prev && continues(prev, event)) {
			if (prev.t === event.t || (next && continues(event, next))) {
				return { action: "merged", into: prev };
			}
			if (kept && continues(kept, prev) && continues(kept, event)) {
				this.#events[this.#events.indexOf(prev)] = event;
				this.#events.sort((a, b) => a.t - b.t);
				return { action: "extended", event, replaced: prev };
			}
		}
		this.#events.push(event);
		this.#events.sort((a, b) => a.t - b.t);
		return { action: "added", event };
	}
}
