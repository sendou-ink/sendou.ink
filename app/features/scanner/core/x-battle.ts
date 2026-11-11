/**
 * The X Battle lobby cards as a built match carries them: the match builder
 * hands each card to the game it follows, so an undecided game holds its set
 * count and the deciding game the set's result and X Rank position.
 */

import {
	X_RANK_POSITION_EVENT_TYPE,
	type XRankPositionData,
} from "./detectors/x-rank/position";
import {
	X_SET_COUNT_EVENT_TYPE,
	type XSetCountData,
} from "./detectors/x-rank/set-count";
import {
	X_SET_RESULT_EVENT_TYPE,
	type XSetResultData,
} from "./detectors/x-rank/set-result";
import type { DetectedEvent } from "./events";

export interface XBattleCards {
	count: XSetCountData | null;
	result: XSetResultData | null;
	position: XRankPositionData | null;
}

/** The latest read of each X Battle card among a match's source events. */
export function xBattleCards(sources: readonly DetectedEvent[]): XBattleCards {
	return {
		count:
			sources.findLast((event) => event.type === X_SET_COUNT_EVENT_TYPE)
				?.data ?? null,
		result:
			sources.findLast((event) => event.type === X_SET_RESULT_EVENT_TYPE)
				?.data ?? null,
		position:
			sources.findLast((event) => event.type === X_RANK_POSITION_EVENT_TYPE)
				?.data ?? null,
	};
}
