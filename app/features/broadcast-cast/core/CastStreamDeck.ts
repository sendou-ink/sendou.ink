import type { BroadcastAdvance } from "~/features/broadcast/broadcast-types";
import * as Producer from "~/features/broadcast/core/Producer";
import * as StreamDeck from "~/modules/stream-deck/stream-deck";
import {
	BROADCAST_AUTO_TAKE_IMMINENT_MS,
	BROADCAST_SCENE_GROUPS,
	CAST_PRODUCER_RULES,
} from "../broadcast-cast-constants";
import type {
	CastBroadcastState,
	CastProducerState,
	CastScene,
} from "../broadcast-cast-types";
import { needsFeaturedMatch } from "../broadcast-cast-utils";

/**
 * The keys from the top left, row by row: the scenes in the scene picker's order (the number keys' order), then the
 * queue item edited and how it goes on air, and Take in the bottom right corner.
 */
const LAYOUT: ReadonlyArray<CastScene | "queueItem" | "advance" | "take"> = [
	...BROADCAST_SCENE_GROUPS.flatMap((group) => group.scenes),
	"queueItem",
	"advance",
	"take",
];

export type Key =
	| {
			type: "scene";
			scene: CastScene;
			/** The scene on air. */
			isLive: boolean;
			/** The scene of the queue item the dashboard edits, the one pressing a scene key changes. */
			isSelected: boolean;
			isDisabled: boolean;
	  }
	| {
			type: "queueItem";
			/** Of the queue item edited, 0 for next. */
			position: number;
			/** Items in the queue. */
			count: number;
			scene: CastScene;
			/** The item pressing the key edits instead, the first again after the last. `null` while next is the only item: pressing it queues a new one. */
			nextItemId: number | null;
			isDisabled: false;
	  }
	| {
			type: "advance";
			/** The queue item edited. */
			itemId: number;
			/** How it goes on air besides a Take. */
			advance: BroadcastAdvance;
			/** Which game event `game` waits for, `null` for the other advances. */
			gameCue: "start" | "end" | null;
			/** What pressing the key sets it to, the next of the advances it can have. */
			nextAdvance: BroadcastAdvance;
			/** Only a Take can put it on air. */
			isDisabled: boolean;
	  }
	| {
			type: "take";
			isDisabled: boolean;
			/** Time until next goes on air by itself, `null` when it doesn't by a timer. */
			remainingMs: number | null;
			/** Next goes on air as the scanner sees this, `null` when it doesn't wait for a game. */
			gameCue: "start" | "end" | null;
			/** Next goes on air by itself in a moment. */
			isImminent: boolean;
	  };

/**
 * What each key of a 15 key Stream Deck shows, from the top left row by row ({@link StreamDeck.COLUMNS} per row).
 * A scene key sets the scene of `selected` (the queue item the dashboard edits, as the number keys do). The queue
 * item key moves the editing on to the next item in the queue (queues a new one while next is the only item), the advance key cycles how the item edited goes on
 * air (on a Take, by a timer, at a game start or end) through the ones it can have there, and Take does what the
 * dashboard's button does. Keys that can't do anything right now are disabled, e.g. the match scenes while no match
 * is cast.
 */
export function keys({
	state,
	selected,
	now,
}: {
	state: CastBroadcastState;
	selected: CastProducerState;
	/** Server time, `null` before the clock is synced. */
	now: number | null;
}): Key[] {
	const hasMatch = state.match !== null;
	const canTake = Producer.canTake(CAST_PRODUCER_RULES, state, { hasMatch });
	const autoTakeAt = Producer.autoTakeAt(CAST_PRODUCER_RULES, state, {
		hasMatch,
	});
	const remainingMs =
		autoTakeAt !== null && now !== null ? Math.max(0, autoTakeAt - now) : null;
	const gameCue =
		Producer.effectiveAdvance(CAST_PRODUCER_RULES, state.live, state.next) ===
		"game"
			? Producer.gameCue(CAST_PRODUCER_RULES, state.live, state.next)
			: null;

	const staged = Producer.stagedItems(state);
	const position = Math.max(
		0,
		staged.findIndex((item) => item.id === selected.id),
	);
	const before = position === 0 ? state.live : staged[position - 1];
	const advance = Producer.effectiveAdvance(
		CAST_PRODUCER_RULES,
		before,
		selected,
	);
	const advanceOptions = Producer.advanceOptions(
		CAST_PRODUCER_RULES,
		before,
		selected,
	);

	return LAYOUT.map((key): Key => {
		switch (key) {
			case "queueItem":
				return {
					type: "queueItem",
					position,
					count: staged.length,
					scene: selected.scene,
					nextItemId:
						staged.length === 1
							? null
							: staged[(position + 1) % staged.length].id,
					isDisabled: false,
				};
			case "advance":
				return {
					type: "advance",
					itemId: selected.id,
					advance,
					gameCue:
						advance === "game"
							? Producer.gameCue(CAST_PRODUCER_RULES, before, selected)
							: null,
					nextAdvance:
						advanceOptions[
							(advanceOptions.indexOf(advance) + 1) % advanceOptions.length
						],
					isDisabled: advanceOptions.length < 2,
				};
			case "take":
				return {
					type: "take",
					isDisabled: !canTake,
					remainingMs: canTake ? remainingMs : null,
					gameCue: canTake && remainingMs === null ? gameCue : null,
					isImminent:
						canTake &&
						remainingMs !== null &&
						remainingMs <= BROADCAST_AUTO_TAKE_IMMINENT_MS,
				};
			default:
				return {
					type: "scene",
					scene: key,
					isLive: state.live.scene === key,
					isSelected: selected.scene === key,
					isDisabled: !hasMatch && needsFeaturedMatch(key),
				};
		}
	});
}
