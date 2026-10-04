/**
 * The X Battle lobby cards as a built match carries them: the match builder
 * hands each card to the game it follows, so an undecided game holds its set
 * count and the deciding game the set's result and X Rank position.
 */
import type { DetectedEvent } from "./detectors/types";
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

export const X_BATTLE_CARD_EVENT_TYPES: readonly string[] = [
	X_SET_COUNT_EVENT_TYPE,
	X_SET_RESULT_EVENT_TYPE,
	X_RANK_POSITION_EVENT_TYPE,
];

export interface XBattleCards {
	count: XSetCountData | null;
	result: XSetResultData | null;
	position: XRankPositionData | null;
}

/** The latest read of each X Battle card among a match's source events. */
export function xBattleCards(sources: readonly DetectedEvent[]): XBattleCards {
	const latest = <T>(type: string): T | null =>
		(sources.findLast((event) => event.type === type)?.data as T | undefined) ??
		null;
	return {
		count: latest<XSetCountData>(X_SET_COUNT_EVENT_TYPE),
		result: latest<XSetResultData>(X_SET_RESULT_EVENT_TYPE),
		position: latest<XRankPositionData>(X_RANK_POSITION_EVENT_TYPE),
	};
}
