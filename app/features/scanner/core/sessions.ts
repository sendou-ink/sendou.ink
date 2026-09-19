/**
 * Sessions are client-only and derived at render: live detections ordered by
 * wall-clock time, split wherever two consecutive detections lie ≥ 2 h apart.
 * A session is keyed by its first event's `detectedAt` (stable across reloads,
 * usable in a URL). Retention evicts whole sessions on the same split.
 */
import type { ScannerMatch } from "./scanner-match";

export const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_SESSIONS = 20;

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
 * `SESSION_MAX_AGE_MS` or beyond the newest `MAX_SESSIONS`. A session's age is
 * its last event's.
 */
export function expiredSessionEventIds<E extends Stamped & { id: number }>(
	events: readonly E[],
	now: number,
): number[] {
	const sessions = splitSessions(events);
	const kept = sessions.slice(-MAX_SESSIONS);
	return sessions
		.filter(
			(session) =>
				!kept.includes(session) ||
				now - session.at(-1)!.detectedAt > SESSION_MAX_AGE_MS,
		)
		.flatMap((session) => session.map((event) => event.id));
}
