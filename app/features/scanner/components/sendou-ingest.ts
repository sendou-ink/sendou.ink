/**
 * Browser client for sendou.ink's /ingest. The scanner runs inside sendou.ink,
 * so requests are same-origin: the session cookie rides along and the
 * logged-in user comes from the root loader (useUser); the server resolves
 * the tournament/match. The unit of accounting is one ScannerMatch
 * (core/match-builder.ts) — every source event's IndexedDB record, live or
 * VoD, tracks its outcome (the `send` status the match cards display) — while
 * the unit of transport is a request of up to `MAX_MATCHES_PER_REQUEST`.
 * Resends are safe: sendou.ink dedupes by content hash, merges partials, and
 * scoreboards are first-ingest-wins.
 */

import * as R from "remeda";
import type { IngestResponse } from "~/features/scanner-ingest/scanner-ingest-schemas";
import { SCOREBOARD_EVENT_TYPES } from "../core/detectors/registry";
import type { DetectedEvent } from "../core/detectors/types";
import type { BuiltMatch } from "../core/match-builder";
import { buildScannerMatches, ingestSkipReasons } from "../core/match-builder";
import type { ScannerMatch } from "../core/scanner-match";
import { EVENTS_STORE } from "../store/db";
import { type SendStatus, updateEventsSend } from "../store/events";
import type { ScanEvent } from "./session-data";

const INGEST_URL = "/ingest";

/** /ingest accepts at most 50 matches per request (mirrors the server cap) */
const MAX_MATCHES_PER_REQUEST = 50;

/**
 * Retry delays after each unlinked send: a live send usually beats the players
 * to reporting the game, so the first attempts find nothing to link to. Running
 * out gives up — the capture ending still makes one last attempt.
 */
const UNLINKED_RETRY_DELAYS_MS = [30_000, 2 * 60_000, 5 * 60_000];

export interface SendResult {
	sentMatches: number;
	failedMatches: number;
}

/**
 * Builds the stored events into matches, POSTs the ingestable ones `include`
 * selects, and records the outcome on every source event's `send` status
 * (calling `onStatus` after each request's store writes).
 *
 * Matches go out in as few requests as the server cap allows: sendou.ink
 * resolves a whole request at once, so several matches anchor on their
 * mode+stage sequence instead of one match's timestamp — this is what makes
 * catching up on a session's backlog work. One request resolves to one
 * context, so a backlog spanning two links the larger and leaves the rest
 * "unlinked"; the retry carries only those, which then resolve on their own.
 */
export async function sendMatches({
	events,
	include,
	onStatus,
	store = EVENTS_STORE,
}: {
	events: readonly ScanEvent[];
	include: (built: BuiltMatch<ScanEvent>) => boolean;
	onStatus: () => void;
	/** the IndexedDB store the events' send statuses are written to */
	store?: string;
}): Promise<SendResult> {
	const allBuilt = ingestableBuilt(
		buildScannerMatches(events.filter((e) => e.id !== undefined)),
	);
	const selected = allBuilt.filter(include);
	await clearOrphanedQueued(events, allBuilt, store);

	const result: SendResult = { sentMatches: 0, failedMatches: 0 };
	for (const request of R.chunk(selected, MAX_MATCHES_PER_REQUEST)) {
		const idsPerMatch = request.map((built) => built.sources.map((e) => e.id!));
		await updateEventsSend(
			idsPerMatch.flat(),
			{ state: "sending", at: Date.now() },
			store,
		);
		onStatus();
		try {
			const response = await postIngestMatches(
				request.map((built) => built.match),
			);
			for (const [matchIndex, built] of request.entries()) {
				const link = response.linkedMatches?.find(
					(linked) => linked.matchIndex === matchIndex,
				)?.link;
				// stored but not linked while sendou.ink knows the tournament/SendouQ
				// match: the game is just not reported yet, so a later resend can still
				// land it. Without a context there is nothing to wait for.
				const unlinked = !link && response.contextResolved;
				await updateEventsSend(
					idsPerMatch[matchIndex]!,
					{
						state: unlinked ? "unlinked" : "sent",
						at: Date.now(),
						...(link ? { link } : null),
						...(unlinked
							? {
									attempts:
										(aggregateSendStatus(built.sources)?.attempts ?? 0) + 1,
								}
							: null),
					},
					store,
				);
			}
			result.sentMatches += request.length;
		} catch (err) {
			await updateEventsSend(
				idsPerMatch.flat(),
				{
					state: "failed",
					at: Date.now(),
					error: err instanceof Error ? err.message : String(err),
				},
				store,
			);
			result.failedMatches += request.length;
		}
		onStatus();
	}
	return result;
}

/** Match selector: the match built from the given stored event. */
export function matchContaining(
	id: number,
): (built: BuiltMatch<ScanEvent>) => boolean {
	return (built) => built.sources.some((e) => e.id === id);
}

/**
 * The single send status a match displays, folded from its source events: an
 * in-flight send wins, then failure, then success, then queued; within a
 * state the most recent change is shown.
 */
export function aggregateSendStatus(
	sources: readonly ScanEvent[],
): SendStatus | undefined {
	const statuses = sources
		.map((e) => e.send)
		.filter((status) => status !== undefined);
	for (const state of [
		"sending",
		"failed",
		"unlinked",
		"sent",
		"queued",
	] as const) {
		const ofState = statuses.filter((status) => status.state === state);
		if (ofState.length > 0) {
			return ofState.reduce((a, b) => (a.at >= b.at ? a : b));
		}
	}
	return undefined;
}

/** Match selector: matches not yet sent (nor currently sending). */
export function unsentMatches(built: BuiltMatch<ScanEvent>): boolean {
	return !built.sources.some(
		(e) => e.send?.state === "sent" || e.send?.state === "sending",
	);
}

/** Match selector: matches stored without a game to link to, whose next retry is due. */
export function retryableUnlinkedMatches(
	built: BuiltMatch<ScanEvent>,
): boolean {
	const status = aggregateSendStatus(built.sources);
	if (status?.state !== "unlinked") return false;

	const delay = UNLINKED_RETRY_DELAYS_MS[(status.attempts ?? 1) - 1];
	return delay !== undefined && Date.now() - status.at >= delay;
}

/**
 * Match selector: a closed match whose send was never attempted. A
 * match-close send can be skipped (a page reload loses the queue), so the
 * retry tick flushes these. Sent/unlinked/failed matches follow their own paths.
 */
export function unsentClosedMatches(built: BuiltMatch<ScanEvent>): boolean {
	return (
		built.sources.some((e) => SCOREBOARD_EVENT_TYPES.includes(e.type)) &&
		built.sources.every(
			(e) => e.send === undefined || e.send.state === "queued",
		)
	);
}

function ingestableBuilt<E extends DetectedEvent>(
	built: BuiltMatch<E>[],
): BuiltMatch<E>[] {
	const skipped = ingestSkipReasons(built);
	return built.filter((match) => !skipped.has(match));
}

async function postIngestMatches(
	matches: ScannerMatch[],
): Promise<IngestResponse> {
	const res = await fetch(INGEST_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ matches }),
	});
	if (!res.ok) {
		throw new Error(
			res.status === 401 ? "not logged in to sendou.ink" : await errorText(res),
		);
	}
	return res.json();
}

/**
 * Live sending marks events "queued" as they arrive; ones the builder later
 * leaves out (non-private match, older than the fallback window) would sit
 * "queued" forever, so once a match boundary has passed them clear the status.
 */
async function clearOrphanedQueued(
	events: readonly ScanEvent[],
	allBuilt: BuiltMatch<ScanEvent>[],
	store: string,
): Promise<void> {
	const lastBoundaryT = Math.max(
		...allBuilt.map((built) => built.sources.at(-1)!.t),
		Number.NEGATIVE_INFINITY,
	);
	const builtIds = new Set(
		allBuilt.flatMap((built) => built.sources.map((e) => e.id)),
	);
	const orphaned = events
		.filter(
			(e) =>
				e.send?.state === "queued" &&
				e.id !== undefined &&
				!builtIds.has(e.id) &&
				e.t <= lastBoundaryT,
		)
		.map((e) => e.id!);
	if (orphaned.length > 0) await updateEventsSend(orphaned, undefined, store);
}

async function errorText(res: Response): Promise<string> {
	const text = await res.text().catch(() => "");
	return `POST /ingest -> ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}
