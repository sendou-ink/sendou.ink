/**
 * Content guard for merging scoreboard-shaped events. The replay browser lets
 * users flip between matches' detail screens within seconds, so time alone
 * can't tell "same board, re-sampled" from "next replay opened". Two events
 * are the same match unless something decisive says otherwise; every check
 * tolerates read jitter (glyph misreads, a flipped winner side, fields read
 * on some frames only).
 */
import type { ScoreboardData } from "../detectors/scoreboard/index";
import type { ScoreboardBattleLogReplayData } from "../detectors/scoreboard-battle-log-replay/index";
import { nameSimilarity } from "../text";

/**
 * Re-reads of one replay code on a low-fidelity capture differ in a few glyphs
 * (U/V, G/C); different replays share almost no positions.
 */
const CODE_DIFF_MIN = 7;

/** Paint totals are reliable per-match fingerprints; compared only when both read this many of 8 rows. */
const PAINT_MIN_READ = 6;

/**
 * Rows read whole (paint, K/A, deaths, specials) two boards must share to show
 * the same game whatever else disagrees: a couple of misread rows tolerated,
 * while different games practically never share even one such line.
 */
export const SAME_GAME_MIN_SHARED_STAT_LINES = 6;

/** Paired rows whose names must have been read on both boards before a rename can be told. */
const RENAME_MIN_NAMES_COMPARED = 4;
/** More paired rows than this keeping their name is the same names re-read, not a rename. */
const RENAME_MAX_NAMES_KEPT = 1;
/** Names at least this alike are one name re-read (OCR jitter); alias and real name share next to nothing. */
const SAME_NAME_MIN_SIMILARITY = 0.5;

/** Positions where two equal-length strings disagree (∞ on length mismatch). */
function charDiff(a: string, b: string): number {
	if (a.length !== b.length) return Number.POSITIVE_INFINITY;
	let n = 0;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
	return n;
}

/** Size of the multiset intersection of two number lists. */
export function multisetOverlap(a: number[], b: number[]): number {
	const counts = new Map<number, number>();
	for (const v of a) counts.set(v, (counts.get(v) ?? 0) + 1);
	let n = 0;
	for (const v of b) {
		const c = counts.get(v) ?? 0;
		if (c > 0) {
			counts.set(v, c - 1);
			n++;
		}
	}
	return n;
}

/**
 * How many rows two boards share whole (paint, K/A, deaths, specials all read
 * and equal), order-free: a history screen can misplace the winner panel.
 */
export function sharedStatLines(a: ScoreboardData, b: ScoreboardData): number {
	const linesOf = (board: ScoreboardData) =>
		board.players.flatMap((player) => {
			const line = statLine(player);
			return line === null ? [] : [line];
		});
	const bLines = linesOf(b);
	let shared = 0;
	for (const line of linesOf(a)) {
		const index = bLines.indexOf(line);
		if (index === -1) continue;
		bLines.splice(index, 1);
		shared++;
	}
	return shared;
}

/**
 * `b`'s names for `a`'s rows (by row index) when `b` shows the same game's
 * players under other names: X Battle draws random aliases on the results
 * screen and the battle log until the log is asked for the real names. Rows
 * pair by their stat line (unique ones only); null unless enough of them pair
 * and next to none of their names agree.
 */
export function renamedRows(
	a: ScoreboardData,
	b: ScoreboardData,
): Map<number, string> | null {
	const pairs = pairedRows(a, b);
	if (pairs.length < SAME_GAME_MIN_SHARED_STAT_LINES) return null;

	const named = pairs.filter(
		([aRow, bRow]) =>
			a.players[aRow]!.name.trim() !== "" &&
			b.players[bRow]!.name.trim() !== "",
	);
	const kept = named.filter(
		([aRow, bRow]) =>
			nameSimilarity(a.players[aRow]!.name, b.players[bRow]!.name) >=
			SAME_NAME_MIN_SIMILARITY,
	);
	if (
		named.length < RENAME_MIN_NAMES_COMPARED ||
		kept.length > RENAME_MAX_NAMES_KEPT
	) {
		return null;
	}

	return new Map(
		named.map(([aRow, bRow]) => [aRow, b.players[bRow]!.name.trim()]),
	);
}

/** Row index pairs whose stat line is read whole and unique on both boards. */
function pairedRows(
	a: ScoreboardData,
	b: ScoreboardData,
): Array<[number, number]> {
	const uniqueLines = (board: ScoreboardData) => {
		const rows = new Map<string, number | null>();
		for (const [row, player] of board.players.entries()) {
			const line = statLine(player);
			if (line === null) continue;
			rows.set(line, rows.has(line) ? null : row);
		}
		return rows;
	};
	const bRows = uniqueLines(b);
	return [...uniqueLines(a)].flatMap(([line, aRow]) => {
		const bRow = bRows.get(line);
		return aRow !== null && typeof bRow === "number" ? [[aRow, bRow]] : [];
	});
}

function statLine(player: ScoreboardData["players"][number]): string | null {
	const { paint, ka, d, s } = player;
	if (paint === null || ka === null || d === null || s === null) return null;
	return `${paint}/${ka}/${d}/${s}`;
}

/** The non-null paint values, order-free (winner side can flip between reads). */
function paints(data: Partial<ScoreboardData>): number[] {
	return (data.players ?? [])
		.map((p) => p.paint)
		.filter((p): p is number => p !== null);
}

/**
 * Whether two scoreboard events plausibly show the same match. Fields are
 * only compared when both sides read them, so a null read never splits.
 */
export function sameScoreboardMatch(a: unknown, b: unknown): boolean {
	const da = a as Partial<ScoreboardData> &
		Partial<ScoreboardBattleLogReplayData>;
	const db = b as Partial<ScoreboardData> &
		Partial<ScoreboardBattleLogReplayData>;

	// the battle log revealing X Battle's real names: a view of its own, which
	// a more confident alias read must not swallow
	if (
		da.players &&
		db.players &&
		renamedRows(da as ScoreboardData, db as ScoreboardData)
	) {
		return false;
	}

	const stageA = da.stage ?? null;
	const stageB = db.stage ?? null;
	if (stageA !== null && stageB !== null && stageA !== stageB) return false;

	// replay detail screens: the recording timestamp and the replay code
	// both identify the replay (timestamp reads are shape-validated, so a
	// garbled read comes back null rather than as a different valid time)
	const tsA = da.timestamp ?? null;
	const tsB = db.timestamp ?? null;
	if (tsA !== null && tsB !== null && tsA !== tsB) return false;
	const codeA = da.replayCode ?? null;
	const codeB = db.replayCode ?? null;
	if (
		codeA !== null &&
		codeB !== null &&
		charDiff(codeA, codeB) >= CODE_DIFF_MIN
	)
		return false;

	// same lobby, different map: names stay identical, but the paint totals
	// are distinctive per match — near-zero overlap means a different board
	const pa = paints(da);
	const pb = paints(db);
	if (
		pa.length >= PAINT_MIN_READ &&
		pb.length >= PAINT_MIN_READ &&
		multisetOverlap(pa, pb) < Math.min(pa.length, pb.length) / 2
	)
		return false;

	return true;
}
