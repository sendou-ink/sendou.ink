/**
 * Version of the event shapes (`type`, `data` and `scores`) the detectors emit
 * and the builders read. Events outlive the code that wrote them (IndexedDB, Game data
 * zips, event tapes) and are rebuilt into matches by whatever code runs now,
 * so every stored event is stamped with the version it was written at and
 * brought up to `CURRENT` when read.
 *
 * Changing an event's shape in a way a reader of the old shape can't take
 * (a renamed/removed/retyped field, a renamed type): bump `CURRENT` and add
 * the step from the previous version to `STEPS`. A purely additive optional
 * field needs neither.
 */

/** The version events are written at. */
export const CURRENT = 3;

/** Events stored before they were stamped. */
const UNSTAMPED = 1;

/** The key a version 1 read's one score goes under: no field of any `data`, so it takes part in no vote. */
const WHOLE_READ = "*";

/** A stored event as a step sees it: the detection among whatever else its record holds. */
type EventShape = Record<string, unknown> & {
	type: string;
	data: unknown;
};

/**
 * Brings an event from the keyed version to the next, keeping the fields it
 * does not change; null = it has no equivalent there and is dropped.
 */
type Step = (event: EventShape) => EventShape | null;

interface Schema {
	current: number;
	steps: Readonly<Record<number, Step>>;
}

const STEPS: Readonly<Record<number, Step>> = {
	// the one `confidence` of a read became `scores` per field (core/field-scores.ts)
	1: ({ confidence, ...event }) => ({
		...event,
		scores: { [WHOLE_READ]: typeof confidence === "number" ? confidence : 0 },
	}),
	// PlayerStatus flags became per-slot evidence (core/status-decode.ts decodes them)
	2: (event) =>
		event.type === "PlayerStatus" ? playerStatusEvidence(event) : event,
};

/**
 * A version 2 status flag as evidence: the state it was read in counts as one
 * confident read (detectors/objective/player-status.ts); an empty seat was
 * stored as alive.
 */
const FLAGGED_STATE_EVIDENCE = 0.9;
const OTHER_STATE_EVIDENCE = 0.05;

/** A version 2 PlayerStatus read: special/dead flags per slot, one score per slot covering both. */
function playerStatusEvidence(event: EventShape): EventShape {
	const data = event.data as {
		time: number | null;
		special: boolean[][];
		dead: boolean[][];
		cast: true | null;
	};
	const scores = (event.scores ?? {}) as Record<string, number>;
	const slotScores: Record<string, number> = {};
	for (const [field, score] of Object.entries(scores)) {
		const slot = field.match(/^special\.(\d)\.(\d),dead\.\d\.\d$/);
		slotScores[slot ? `slots.${slot[1]}.${slot[2]}` : field] = score;
	}
	return {
		...event,
		scores: slotScores,
		data: {
			time: data.time,
			slots: data.dead.map((side, sideIndex) =>
				side.map((dead, slot) => {
					const state = dead ? 2 : data.special[sideIndex]![slot] ? 1 : 0;
					return [0, 1, 2].map((index) =>
						index === state ? FLAGGED_STATE_EVIDENCE : OTHER_STATE_EVIDENCE,
					);
				}),
			),
			cast: data.cast,
		},
	};
}

const SCHEMA: Schema = { current: CURRENT, steps: STEPS };

/**
 * The event in the current shape, given the version it was written at
 * (undefined = before events were stamped). The same object when it is
 * already current; null when it can't be read: a step dropped it, or it was
 * written by newer code than this (another tab after a deploy).
 * @internal
 */
export function upgradedFrom<T extends { type: string; data: unknown }>(
	version: number | undefined,
	event: T,
	schema: Schema = SCHEMA,
): T | null {
	const from = version ?? UNSTAMPED;
	if (from === schema.current) return event;
	if (from > schema.current) return null;

	let shape: EventShape = event as EventShape;
	for (let at = from; at < schema.current; at++) {
		const next = schema.steps[at]?.(shape) ?? null;
		if (!next) return null;
		shape = next;
	}
	// typed as the current shape the steps brought it to
	return shape as T;
}

/**
 * Stored records as the current code reads them: each upgraded from its `v`
 * stamp and restamped, the unreadable ones left out. Records already current
 * stay the same objects.
 */
export function readable<T extends { type: string; data: unknown; v?: number }>(
	records: readonly T[],
	schema: Schema = SCHEMA,
): T[] {
	const result: T[] = [];
	for (const record of records) {
		const upgraded = upgradedFrom(record.v, record, schema);
		if (!upgraded) continue;
		result.push(
			upgraded === record ? record : { ...upgraded, v: schema.current },
		);
	}
	return result;
}
