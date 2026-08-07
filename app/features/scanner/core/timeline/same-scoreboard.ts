/**
 * Content guard for merging scoreboard-shaped events (results screen,
 * replay-browser detail). The replay browser lets users flip between
 * different matches' detail screens within seconds, so a time window alone
 * can't tell "same board, re-sampled" from "next replay opened." Two events
 * are treated as the same match unless something decisive says otherwise;
 * every check tolerates read jitter (glyph misreads, a flipped winner side,
 * fields that only read on some frames), so a split only happens on
 * evidence that survives that noise.
 */
import type { ScoreboardData } from "../detectors/scoreboard/index";
import type { ScoreboardBattleLogReplayData } from "../detectors/scoreboard-battle-log-replay/index";

/**
 * Replay codes of the same replay re-read on a low-fidelity capture differ
 * in a few glyphs (U/V, G/C confusions); different replays share almost no
 * positions. Split only past this many mismatched characters.
 */
const CODE_DIFF_MIN = 7;

/**
 * Paint totals are per-match fingerprints that read reliably (big digits).
 * Compared only when both events read at least this many of the 8 rows.
 */
const PAINT_MIN_READ = 6;

/** Positions where two equal-length strings disagree (∞ on length mismatch). */
function charDiff(a: string, b: string): number {
	if (a.length !== b.length) return Number.POSITIVE_INFINITY;
	let n = 0;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
	return n;
}

/** Size of the multiset intersection of two number lists. */
function multisetOverlap(a: number[], b: number[]): number {
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
	if (pa.length >= PAINT_MIN_READ && pb.length >= PAINT_MIN_READ) {
		if (multisetOverlap(pa, pb) < Math.min(pa.length, pb.length) / 2)
			return false;
	}

	return true;
}
