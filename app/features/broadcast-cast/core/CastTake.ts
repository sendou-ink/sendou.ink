import * as Producer from "~/features/broadcast/core/Producer";
import {
	BROADCAST_AUTO_TAKE_IMMINENT_MS,
	CAST_PRODUCER_RULES,
} from "../broadcast-cast-constants";
import type { CastBroadcastState } from "../broadcast-cast-types";

export interface TakeStatus {
	/** Next can go on air, it isn't a match scene waiting for a featured match. */
	canTake: boolean;
	/** Time until next goes on air by itself, `null` when it doesn't by a timer (anymore). */
	remainingMs: number | null;
	/** Next goes on air as the scanner sees this, `null` when it doesn't wait for a game. */
	gameCue: "start" | "end" | null;
	/** Next goes on air by itself in a moment. */
	isImminent: boolean;
}

/** Whether Take can be pressed and what puts next on air by itself: a countdown, a game cue or neither. */
export function status({
	state,
	now,
}: {
	state: CastBroadcastState;
	/** Server time, `null` before the clock is synced. */
	now: number | null;
}): TakeStatus {
	const hasMatch = state.match !== null;
	const canTake = Producer.canTake(CAST_PRODUCER_RULES, state, { hasMatch });
	const autoTakeAt = Producer.autoTakeAt(CAST_PRODUCER_RULES, state, {
		hasMatch,
	});
	// one whose time passed too long ago waits for a Take, see `Producer.isAutoTakeLapsed`
	const remainingMs =
		canTake &&
		autoTakeAt !== null &&
		now !== null &&
		!Producer.isAutoTakeLapsed(autoTakeAt, { now })
			? Math.max(0, autoTakeAt - now)
			: null;
	const gameCue =
		canTake &&
		remainingMs === null &&
		Producer.effectiveAdvance(CAST_PRODUCER_RULES, state.live, state.next) ===
			"game"
			? Producer.gameCue(CAST_PRODUCER_RULES, state.live, state.next)
			: null;

	return {
		canTake,
		remainingMs,
		gameCue,
		isImminent:
			remainingMs !== null && remainingMs <= BROADCAST_AUTO_TAKE_IMMINENT_MS,
	};
}
