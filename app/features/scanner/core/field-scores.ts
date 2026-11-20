/**
 * Per-field scores of a read: how well each field of an event's `data` was
 * read, 0..1, keyed by the field's path in `data` ("players.3.name",
 * "stage"). Fields read as one unit share a key naming each of them
 * ("mode,stage": one line snapped to a mode and stage pair), so they are
 * never taken from different reads. A read scores the fields it vouches for,
 * also where the value came out unread (a weapon icon matched under its
 * floor); a field it could not attempt, or whose cross-check failed, has no
 * score.
 *
 * The scores do three separate jobs, none of them through one number:
 * the timeline drops a read whose scores average under the kind's floor (it
 * is not a read of the screen at all), picks each field of a kept read by
 * vote across the reads of its run, and the scheduler stops reading a screen
 * once the kind's `complete` invariants hold (detectors/types.ts).
 *
 * A read stored before reads were scored per field holds its one score under
 * `*` (core/event-version.ts), which names no field.
 */

export type FieldScores = Readonly<Record<string, number>>;

const UNIT_SEPARATOR = ",";
const PATH_SEPARATOR = ".";

/** What a store, a tape and a scan log all hold exactly. */
const SCORE_DECIMALS = 4;

/**
 * Scores as an event carries them: unread entries (null/undefined) left out,
 * negatives at 0, rounded so every copy of the event holds the same numbers.
 */
export function of(
	scores: Readonly<Record<string, number | null | undefined>>,
): FieldScores {
	const factor = 10 ** SCORE_DECIMALS;
	const result: Record<string, number> = {};
	for (const [field, score] of Object.entries(scores)) {
		if (score === null || score === undefined) continue;
		result[field] = Math.round(Math.max(0, score) * factor) / factor;
	}
	return result;
}

/** `scores` keyed under `prefix`: "name" under "players.3" is "players.3.name". */
export function under(prefix: string, scores: FieldScores): FieldScores {
	return Object.fromEntries(
		Object.entries(scores).map(([field, score]) => [
			field
				.split(UNIT_SEPARATOR)
				.map((path) => `${prefix}${PATH_SEPARATOR}${path}`)
				.join(UNIT_SEPARATOR),
			score,
		]),
	);
}

/** Mean of the scores; 0 for a read that scored nothing. */
export function mean(scores: FieldScores): number {
	const values = Object.values(scores);
	if (values.length === 0) return 0;
	return values.reduce((sum, score) => sum + score, 0) / values.length;
}

/** Whether every one of `fields` was scored, at `floor` or above. */
export function reach(
	scores: FieldScores,
	fields: readonly string[],
	floor: number,
): boolean {
	return fields.every((field) => (scores[field] ?? -1) >= floor);
}

/**
 * The value `field` names in `data`, a unit's as the list of its fields'
 * values; undefined where a path leads nowhere.
 */
export function valueAt(data: unknown, field: string): unknown {
	const paths = field.split(UNIT_SEPARATOR);
	if (paths.length === 1) return valueAtPath(data, field);
	return paths.map((path) => valueAtPath(data, path));
}

/**
 * `data` with the value `field` names replaced (as `valueAt` gives it),
 * copied along the path; `data` itself where the path leads nowhere.
 */
export function withValueAt<T>(data: T, field: string, value: unknown): T {
	const paths = field.split(UNIT_SEPARATOR);
	if (paths.length === 1) {
		return replaced(data, field.split(PATH_SEPARATOR), value) as T;
	}
	const values = Array.isArray(value) ? value : [];
	return paths.reduce<unknown>(
		(result, path, i) =>
			replaced(result, path.split(PATH_SEPARATOR), values[i]),
		data,
	) as T;
}

/** Whether a field's value is a read at all: null, "" and a list holding no read (a unit left unread) are not. */
export function isRead(value: unknown): boolean {
	if (value === null || value === undefined || value === "") return false;
	return !Array.isArray(value) || value.some(isRead);
}

function valueAtPath(data: unknown, path: string): unknown {
	let value = data;
	for (const part of path.split(PATH_SEPARATOR)) {
		if (typeof value !== "object" || value === null) return undefined;
		value = (value as Record<string, unknown>)[part];
	}
	return value;
}

function replaced(
	node: unknown,
	path: readonly string[],
	value: unknown,
): unknown {
	const [part, ...rest] = path;
	if (part === undefined) return value;
	if (typeof node !== "object" || node === null || !(part in node)) {
		return node;
	}
	const child = (node as Record<string, unknown>)[part];
	const next = replaced(child, rest, value);
	if (next === child) return node;
	if (Array.isArray(node)) {
		const copy = [...node];
		copy[Number(part)] = next;
		return copy;
	}
	return { ...node, [part]: next };
}
