/**
 * One player's states over a game, decoded from every status read of them at
 * once: the most likely series of states the reads' evidence allows under
 * what the game itself allows. A read on its own is soft (an icon half under
 * a gauge digit, a wash in its dim pulse, a backdrop through the splat plate);
 * the rules below are hard, so a misread that would break one is outvoted by
 * the reads around it instead of being repaired afterwards.
 *
 * - A splat lasts at least the respawn wait (DEAD_MIN_SECONDS).
 * - A respawned player stays up a moment before the next splat
 *   (RESPAWNED_MIN_SECONDS; spawncamps make this short), and has no special
 *   ready within it either, so a ready run can't carry them past it.
 * - A special spent takes SPECIAL_REGAIN_MIN_SECONDS to charge again; a death
 *   in between is left free (Special Saver keeps part of the gauge).
 * - No special is held in the clock's first SPECIAL_REGAIN_MIN_SECONDS, or
 *   before the clock starts.
 *
 * States are decoded on a grid of TICK_SECONDS from the first read to the
 * last, so a run can fall between reads (a respawn and a recharge inside a
 * gap) and its length counts the ticks it holds, never more than reach from
 * the read before it to the read after it. A tick without a read carries no
 * evidence, and a run at either end has no minimum (nothing shows when it
 * began or ended). Each change of state costs SWITCH_COST, so a lone weak
 * read does not split a run while a confident one does.
 */
import type { SlotEvidence } from "./detectors/objective/player-status";

const TICK_SECONDS = 0.5;

/**
 * Fastest respawn: no true splat is shorter. A respawned player can be
 * splatted again quickly (spawncamps), so the alive floor is a conservative 2s.
 */
const DEAD_MIN_SECONDS = 3.5;
const RESPAWNED_MIN_SECONDS = 2;

/**
 * Regaining a used special takes at least this long (nothing charges off ~7s
 * of painting, even with max Special Charge Up); the clock's first seconds
 * charge nothing either.
 */
const SPECIAL_REGAIN_MIN_SECONDS = 7;

/** Log-odds a change of state has to earn from the reads (a factor of ~2 per change). */
const SWITCH_COST = 0.7;

/** The least a state's evidence counts for: no single read rules a state out. */
const EVIDENCE_FLOOR = 0.02;

export type DecodedState = "alive" | "ready" | "dead";

/** One read of the player. */
export interface StatusRead {
	t: number;
	/** seconds since the game clock started; null when unknown */
	elapsed: number | null;
	/** null = the read says nothing of this player (an empty seat, a card not shown) */
	evidence: SlotEvidence | null;
}

/**
 * Hidden states: alive splits by whether the player last spent a special
 * (the regain rule) or respawned (the respawned rule).
 */
const ALIVE = 0;
const SPENT = 1;
const READY = 2;
const DEAD = 3;
type State = typeof ALIVE | typeof SPENT | typeof READY | typeof DEAD;

/** The evidence entry (alive, ready, dead) a state reads as. */
const EVIDENCE_INDEX: Record<State, 0 | 1 | 2> = {
	[ALIVE]: 0,
	[SPENT]: 0,
	[READY]: 1,
	[DEAD]: 2,
};

const DECODED: Record<State, DecodedState> = {
	[ALIVE]: "alive",
	[SPENT]: "alive",
	[READY]: "ready",
	[DEAD]: "dead",
};

/** Where each state can go next, after holding it at least `minSeconds`. */
const EXITS: Record<State, readonly { to: State; minSeconds: number }[]> = {
	[ALIVE]: [
		{ to: READY, minSeconds: RESPAWNED_MIN_SECONDS },
		{ to: DEAD, minSeconds: RESPAWNED_MIN_SECONDS },
	],
	[SPENT]: [
		{ to: READY, minSeconds: SPECIAL_REGAIN_MIN_SECONDS },
		{ to: DEAD, minSeconds: 0 },
	],
	[READY]: [
		{ to: SPENT, minSeconds: 0 },
		{ to: DEAD, minSeconds: 0 },
	],
	[DEAD]: [{ to: ALIVE, minSeconds: DEAD_MIN_SECONDS }],
};

/**
 * The decode's cells: a state with how many ticks it has held, counted up to
 * the most any of its exits needs (a run held that long may end any way).
 */
const CELLS = ([ALIVE, SPENT, READY, DEAD] as const).flatMap((state) =>
	Array.from({ length: heldTicksOf(state) }, (_, i) => ({
		state,
		ticks: i + 1,
	})),
);

/** Per cell, the cells the next tick can be in: staying first, then every exit its ticks allow. */
const NEXT = CELLS.map((cell) => [
	{
		to: cellOf(cell.state, Math.min(cell.ticks + 1, heldTicksOf(cell.state))),
		switches: false,
	},
	...EXITS[cell.state]
		.filter((exit) => cell.ticks >= ticksOf(exit.minSeconds))
		.map((exit) => ({ to: cellOf(exit.to, 1), switches: true })),
]);

/** A run already under way when the reads begin: held long enough for any exit. */
const OPENING_CELLS = ([ALIVE, READY, DEAD] as const).map((state) =>
	cellOf(state, heldTicksOf(state)),
);

/**
 * The player's state at each read, in the order given (sorted by `t`). Every
 * read is decoded, also the ones with no evidence, which take the states
 * around them.
 */
export function decode(reads: readonly StatusRead[]): DecodedState[] {
	if (reads.length === 0) return [];
	const start = reads[0]!.t;
	const tickOf = (t: number) => Math.round((t - start) / TICK_SECONDS);
	const tickCount = tickOf(reads.at(-1)!.t) + 1;

	const logEvidence = new Float64Array(tickCount * 3);
	const noSpecial = new Uint8Array(tickCount);
	for (const read of reads) {
		const tick = tickOf(read.t);
		if (read.elapsed !== null && read.elapsed < SPECIAL_REGAIN_MIN_SECONDS) {
			noSpecial[tick] = 1;
		}
		if (!read.evidence) continue;
		for (let i = 0; i < 3; i++) {
			logEvidence[tick * 3 + i]! += Math.log(
				Math.max(read.evidence[i]!, EVIDENCE_FLOOR),
			);
		}
	}
	const scoreAt = (tick: number, cell: number) => {
		const { state } = CELLS[cell]!;
		if (state === READY && noSpecial[tick]) return Number.NEGATIVE_INFINITY;
		return logEvidence[tick * 3 + EVIDENCE_INDEX[state]]!;
	};

	const cellCount = CELLS.length;
	const cameFrom = new Int16Array(tickCount * cellCount);
	let scores = new Float64Array(cellCount).fill(Number.NEGATIVE_INFINITY);
	for (const cell of OPENING_CELLS) scores[cell] = scoreAt(0, cell);

	for (let tick = 1; tick < tickCount; tick++) {
		const next = new Float64Array(cellCount).fill(Number.NEGATIVE_INFINITY);
		const row = tick * cellCount;
		for (let cell = 0; cell < cellCount; cell++) {
			const held = scores[cell]!;
			if (held === Number.NEGATIVE_INFINITY) continue;
			for (const step of NEXT[cell]!) {
				const candidate = held - (step.switches ? SWITCH_COST : 0);
				if (candidate > next[step.to]!) {
					next[step.to] = candidate;
					cameFrom[row + step.to] = cell;
				}
			}
		}
		for (let cell = 0; cell < cellCount; cell++) {
			if (next[cell] !== Number.NEGATIVE_INFINITY) {
				next[cell] += scoreAt(tick, cell);
			}
		}
		scores = next;
	}

	let path = 0;
	for (let cell = 1; cell < cellCount; cell++) {
		if (scores[cell]! > scores[path]!) path = cell;
	}
	const statesByTick: DecodedState[] = new Array(tickCount);
	for (let tick = tickCount - 1; tick >= 0; tick--) {
		statesByTick[tick] = DECODED[CELLS[path]!.state];
		path = cameFrom[tick * cellCount + path]!;
	}
	return reads.map((read) => statesByTick[tickOf(read.t)]!);
}

function ticksOf(seconds: number): number {
	return Math.ceil(seconds / TICK_SECONDS - 1e-9);
}

/** Ticks a run of `state` is counted up to: the most any of its exits needs, at least one. */
function heldTicksOf(state: State): number {
	return Math.max(1, ...EXITS[state].map((exit) => ticksOf(exit.minSeconds)));
}

function cellOf(state: State, ticks: number): number {
	return CELLS.findIndex(
		(cell) => cell.state === state && cell.ticks === ticks,
	);
}
