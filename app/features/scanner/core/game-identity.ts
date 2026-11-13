/**
 * Which results and history screens show the same game, told by the boards
 * alone, in whatever order and at whatever time they were read. Paint totals
 * practically never repeat between games, so two boards sharing at least six
 * of them (order-free: a history screen can misplace the winner panel), with
 * no stage contradicting, show one game. A history screen also has to share
 * six whole stat lines (paint, K/A, D, S) with the other board or its
 * recording time must not contradict the other's play time: the console clock
 * can be hours off the PC's (another timezone, a misread AM/PM), so whole
 * stat lines outrank it. Two results screens are one game only when no
 * gameplay was read between them (the screen read again after an overlay hid
 * it); results screens either side of a game are two games, whatever their
 * boards.
 */
import type { ScoreboardData } from "./detectors/scoreboard/index";
import type { ScoreboardBattleLogData } from "./detectors/scoreboard-battle-log/index";
import type { ScoreboardBattleLogReplayData } from "./detectors/scoreboard-battle-log-replay/index";
import {
	type DetectedEvent,
	isHistoryScoreboardEvent,
	type ScoreboardFamilyEvent,
} from "./events";
import { parseReplayTimestamp } from "./replay-time";
import {
	multisetOverlap,
	SAME_GAME_MIN_SHARED_STAT_LINES,
	sharedStatLines,
} from "./timeline/same-scoreboard";

/**
 * Paint totals two boards must share to show the same game: tolerates a couple
 * of misread or unread rows, while different games practically never share this many.
 */
const SAME_GAME_MIN_SHARED_PAINTS = 6;

/**
 * How far a history screen's recording time may sit from another board's play
 * time of the same game: it is on the console clock and marks the game's
 * start, while a results screen's time is the PC clock at the game's end.
 */
export const PLAYED_AT_TOLERANCE_MS = 20 * 60 * 1000;

/** The boards of one game, in time order. */
export type GameIdentity<E extends DetectedEvent> = (E &
	ScoreboardFamilyEvent)[];

/**
 * Groups boards into games. `segmentStarts` are the times gameplay segments
 * start (game-segments.ts): results screens with one between them are
 * different games. No-contest boards show no game and are left out.
 */
export function cluster<E extends DetectedEvent>(
	boards: readonly (E & ScoreboardFamilyEvent)[],
	segmentStarts: readonly number[],
): GameIdentity<E>[] {
	const sorted = boards
		.filter((board) => !board.data.noContest)
		.toSorted((a, b) => a.t - b.t);
	const prints = sorted.map((board) => ({
		board,
		paints: paintsRead(board.data),
		playedAt: playedAt(board),
		resultsStretch: isHistoryScoreboardEvent(board)
			? null
			: segmentStarts.filter((start) => start <= board.t).length,
	}));

	const parent = prints.map((_, i) => i);
	const stretch = prints.map((print) => print.resultsStretch);
	const find = (index: number): number => {
		let root = index;
		while (parent[root] !== root) {
			parent[root] = parent[parent[root]!]!;
			root = parent[root]!;
		}
		return root;
	};
	const boardsByPaint = new Map<number, { index: number; count: number }[]>();
	for (const [j, print] of prints.entries()) {
		const counts = valueCounts(print.paints);
		const sharedCounts = new Map<number, number>();
		for (const [paint, count] of counts) {
			for (const earlier of boardsByPaint.get(paint) ?? []) {
				sharedCounts.set(
					earlier.index,
					(sharedCounts.get(earlier.index) ?? 0) +
						Math.min(count, earlier.count),
				);
			}
		}
		// the latest earlier board first: a game shown again joins its last showing
		const candidates = [...sharedCounts]
			.filter(([, shared]) => shared >= SAME_GAME_MIN_SHARED_PAINTS)
			.map(([i]) => i)
			.sort((a, b) => b - a);
		for (const i of candidates) {
			const [rootI, rootJ] = [find(i), find(j)];
			if (rootI === rootJ || !sameGame(prints[i]!, print)) continue;
			const [stretchI, stretchJ] = [stretch[rootI]!, stretch[rootJ]!];
			if (stretchI !== null && stretchJ !== null && stretchI !== stretchJ) {
				continue;
			}
			parent[rootJ] = rootI;
			stretch[rootI] = stretchI ?? stretchJ;
		}
		for (const [paint, count] of counts) {
			const withPaint = boardsByPaint.get(paint) ?? [];
			withPaint.push({ index: j, count });
			boardsByPaint.set(paint, withPaint);
		}
	}

	const identities = new Map<number, GameIdentity<E>>();
	for (const [i, print] of prints.entries()) {
		const root = find(i);
		identities.set(root, [...(identities.get(root) ?? []), print.board]);
	}
	return [...identities.values()];
}

/**
 * When the game on a board was played: a history screen's recording time,
 * else the board's detection time (wall clock; live captures only).
 */
export function playedAt(board: DetectedEvent): number | null {
	return recordedAt(board) ?? detectedAtOf(board);
}

/** A history screen's on-screen recording time (the game's start, console clock); null when unread. */
export function recordedAt(event: DetectedEvent): number | null {
	const timestamp = historyData(event)?.timestamp;
	if (!timestamp) return null;
	return parseReplayTimestamp(timestamp, {
		now: detectedAtOf(event) ?? undefined,
	});
}

/** When an event was detected (wall clock), read structurally off richer event records (StoredEvent); null on VoD scans. */
export function detectedAtOf(event: DetectedEvent): number | null {
	return (event as { detectedAt?: number }).detectedAt ?? null;
}

/** The replay-browser and both battle log screens carry the recording timestamp; only the former a replay code. */
export function historyData(
	board: DetectedEvent | null,
):
	| (ScoreboardBattleLogData & Partial<ScoreboardBattleLogReplayData>)
	| undefined {
	return board && isHistoryScoreboardEvent(board) ? board.data : undefined;
}

interface Fingerprint {
	board: ScoreboardFamilyEvent;
	paints: number[];
	playedAt: number | null;
}

/** Two boards sharing enough paint totals (checked by the caller's index) show one game, unless a stage, or a history screen's time, contradicts it. */
function sameGame(a: Fingerprint, b: Fingerprint): boolean {
	const [stageA, stageB] = [a.board.data.stage, b.board.data.stage];
	if (stageA !== null && stageB !== null && stageA !== stageB) return false;
	if (multisetOverlap(a.paints, b.paints) < SAME_GAME_MIN_SHARED_PAINTS) {
		return false;
	}
	if (
		!isHistoryScoreboardEvent(a.board) &&
		!isHistoryScoreboardEvent(b.board)
	) {
		return true;
	}
	return (
		sharedStatLines(a.board.data, b.board.data) >=
			SAME_GAME_MIN_SHARED_STAT_LINES ||
		a.playedAt === null ||
		b.playedAt === null ||
		Math.abs(a.playedAt - b.playedAt) <= PLAYED_AT_TOLERANCE_MS
	);
}

function valueCounts(values: readonly number[]): Map<number, number> {
	const counts = new Map<number, number>();
	for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
	return counts;
}

function paintsRead(board: ScoreboardData): number[] {
	return board.players.flatMap((player) =>
		player.paint !== null ? [player.paint] : [],
	);
}
