/**
 * Sessions are client-only and derived at render: live detections ordered by
 * wall-clock time, split wherever two consecutive detections lie ≥ 2 h apart.
 * A session is keyed by its first event's `detectedAt` (stable across reloads,
 * usable in a URL). Retention evicts whole sessions on the same split, so a
 * kept session's games always rebuild with their full details. A session
 * `SESSION_COMPACT_AFTER_MS` past its end is compacted: its games are frozen
 * as built and the per-second reads behind them dropped (`compactSources`).
 */
import { OBJECTIVE_EVENT_TYPE } from "./detectors/objective/index";
import { PLAYER_STATUS_EVENT_TYPE } from "./detectors/objective/player-status";
import { STRIP_WEAPONS_EVENT_TYPE } from "./detectors/objective/strip-weapons";
import type { ScannerMatch } from "./scanner-match";

export const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SESSIONS = 20;
/**
 * Stored events across sessions. A Splat Zones game keeps ~350 (the counter
 * and status reads behind its timeline), so this holds ~140 games; past it the
 * oldest whole sessions go.
 */
export const MAX_STORED_EVENTS = 50_000;
/**
 * Until then a session keeps its raw reads: debugging a misread and rebuilding
 * after a match builder fix both need them, and frames are kept as long.
 */
export const SESSION_COMPACT_AFTER_MS = 72 * 60 * 60 * 1000;

/**
 * The per-second reads a compacted match drops: its frozen `objective`,
 * `playerStatus` and team weapons already hold what they were read for, and
 * they are ~85% of a game's events.
 */
const COMPACTED_AWAY_TYPES = [
	OBJECTIVE_EVENT_TYPE,
	PLAYER_STATUS_EVENT_TYPE,
	STRIP_WEAPONS_EVENT_TYPE,
];

interface Stamped {
	/** wall-clock ms of detection */
	detectedAt: number;
}

/** Chronological sessions, oldest first; each holds its events oldest first. */
export function splitSessions<E extends Stamped>(events: readonly E[]): E[][] {
	const sessions: E[][] = [];
	for (const event of events.toSorted((a, b) => a.detectedAt - b.detectedAt)) {
		const current = sessions.at(-1);
		const last = current?.at(-1);
		if (
			current &&
			last &&
			event.detectedAt - last.detectedAt < SESSION_GAP_MS
		) {
			current.push(event);
		} else {
			sessions.push([event]);
		}
	}
	return sessions;
}

/** A session's key: its first event's detection time. */
export function sessionKey(session: readonly Stamped[]): number {
	return session[0]!.detectedAt;
}

export interface SessionSummary {
	/** matches whose winner was read */
	games: number;
	wins: number;
	losses: number;
	/** the POV rows' kills+assists and deaths summed; null when no row was read */
	ka: number | null;
	d: number | null;
}

/** "win" / "loss" from the POV seat, null when either the seat or the winner is unread. */
export function matchResult(match: ScannerMatch): "win" | "loss" | null {
	if (match.winner === null || match.pov === null) return null;
	return match.winner === match.pov.team ? "win" : "loss";
}

/** The header line's numbers: games decided, W–L and K/D off the POV rows. */
export function sessionSummary(
	matches: readonly ScannerMatch[],
): SessionSummary {
	let ka: number | null = null;
	let d: number | null = null;
	const summary: SessionSummary = { games: 0, wins: 0, losses: 0, ka, d };
	for (const match of matches) {
		if (match.winner !== null) summary.games++;
		const result = matchResult(match);
		if (result === "win") summary.wins++;
		if (result === "loss") summary.losses++;
		const pov = match.pov
			? match.teams[match.pov.team].players[match.pov.index]
			: undefined;
		if (pov?.ka !== null && pov?.ka !== undefined) ka = (ka ?? 0) + pov.ka;
		if (pov?.d !== null && pov?.d !== undefined) d = (d ?? 0) + pov.d;
	}
	return { ...summary, ka, d };
}

/** K/D as players say it, null before any POV row was read. */
export function kdRatio(summary: SessionSummary): number | null {
	if (summary.ka === null) return null;
	return summary.ka / Math.max(1, summary.d ?? 0);
}

/**
 * Ids of the events retention evicts: every event of a session older than
 * `SESSION_MAX_AGE_MS`, beyond the newest `MAX_SESSIONS` or past the
 * `MAX_STORED_EVENTS` budget, oldest first. A session's age is its last
 * event's. The newest session is never cut for the budget: a session missing
 * its first events would rebuild its games without their intro and timeline.
 */
export function expiredSessionEventIds<E extends Stamped & { id: number }>(
	events: readonly E[],
	now: number,
): number[] {
	const sessions = splitSessions(events);
	let keptCount = 0;
	let keptEvents = 0;
	for (const session of sessions.toReversed()) {
		const tooOld = now - session.at(-1)!.detectedAt > SESSION_MAX_AGE_MS;
		const overBudget =
			keptCount > 0 && keptEvents + session.length > MAX_STORED_EVENTS;
		if (tooOld || overBudget || keptCount === MAX_SESSIONS) break;
		keptCount++;
		keptEvents += session.length;
	}
	return sessions
		.slice(0, sessions.length - keptCount)
		.flatMap((session) => session.map((event) => event.id));
}

/**
 * The source events a compacted match keeps: all but the per-second reads,
 * so its card still lists deaths, shows its scan time and upload state, and
 * the debug view its detections. A match read off nothing else keeps its first
 * source, which the card and uploads identify it by.
 */
export function compactSources<E extends { type: string }>(
	sources: readonly E[],
): E[] {
	const kept = sources.filter(
		(event) => !COMPACTED_AWAY_TYPES.includes(event.type),
	);
	return kept.length > 0 ? kept : sources.slice(0, 1);
}

/**
 * Keys of the compacted sessions retention evicts: older than
 * `SESSION_MAX_AGE_MS`, or beyond the newest `MAX_SESSIONS` once the
 * `rawSessionCount` sessions not yet compacted (always the newest) are counted.
 */
export function expiredCompactedSessionKeys(
	compacted: readonly { key: number; endedAt: number }[],
	rawSessionCount: number,
	now: number,
): number[] {
	const room = Math.max(0, MAX_SESSIONS - rawSessionCount);
	return compacted
		.toSorted((a, b) => b.key - a.key)
		.filter(
			(session, index) =>
				index >= room || now - session.endedAt > SESSION_MAX_AGE_MS,
		)
		.map((session) => session.key);
}
