/**
 * Browser client for sendou.ink's /ingest. The scanner runs inside sendou.ink,
 * so requests are same-origin: the session cookie rides along and the
 * logged-in user comes from the root loader (useUser); the server resolves
 * the tournament/match. The unit of accounting is one ScannerMatch
 * (core/match-builder.ts) — every source event's IndexedDB record tracks its
 * outcome (the `send` status the feed cards display) — while the unit of
 * transport is a request of up to `MAX_MATCHES_PER_REQUEST`. Resends are
 * safe: sendou.ink dedupes by content hash, merges partials, and scoreboards
 * are first-ingest-wins.
 */

import * as R from "remeda";
import type {
	IngestedMatchLink,
	IngestResponse,
} from "~/features/scanner-ingest/scanner-ingest-schemas";
import type { DetectedEvent } from "../core/detectors/types";
import type { BuiltMatch } from "../core/match-builder";
import { buildScannerMatches, ingestSkipReasons } from "../core/match-builder";
import type { ScannerMatch } from "../core/scanner-match";
import {
	type SendStatus,
	type StoredEvent,
	updateEventsSend,
} from "../store/events";

const INGEST_URL = "/ingest";

/** /ingest accepts at most 50 matches per request (mirrors the server cap) */
const MAX_MATCHES_PER_REQUEST = 50;

/**
 * Retry delays after each unlinked send: a live send usually beats the players
 * to reporting the game, so the first attempts find nothing to link to. Running
 * out gives up — the capture ending still makes one last attempt.
 */
const UNLINKED_RETRY_DELAYS_MS = [30_000, 2 * 60_000, 5 * 60_000];

export interface SendouUser {
	id: number;
	username: string;
}

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
}: {
	events: readonly StoredEvent[];
	include: (built: BuiltMatch<StoredEvent>) => boolean;
	onStatus: () => void;
}): Promise<SendResult> {
	const allBuilt = ingestableBuilt(
		buildScannerMatches(events.filter((e) => e.id !== undefined)),
	);
	const selected = allBuilt.filter(include);
	await clearOrphanedQueued(events, allBuilt);

	const result: SendResult = { sentMatches: 0, failedMatches: 0 };
	for (const request of R.chunk(selected, MAX_MATCHES_PER_REQUEST)) {
		const idsPerMatch = request.map((built) => built.sources.map((e) => e.id!));
		await updateEventsSend(idsPerMatch.flat(), {
			state: "sending",
			at: Date.now(),
		});
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
				await updateEventsSend(idsPerMatch[matchIndex]!, {
					state: unlinked ? "unlinked" : "sent",
					at: Date.now(),
					...(link ? { link } : null),
					...(unlinked
						? {
								attempts:
									(aggregateSendStatus(built.sources)?.attempts ?? 0) + 1,
							}
						: null),
				});
			}
			result.sentMatches += request.length;
		} catch (err) {
			await updateEventsSend(idsPerMatch.flat(), {
				state: "failed",
				at: Date.now(),
				error: err instanceof Error ? err.message : String(err),
			});
			result.failedMatches += request.length;
		}
		onStatus();
	}
	return result;
}

export interface VodResultsSendReport {
	sentMatches: number;
	totalMatches: number;
	/** last failure's message; null when every request went through */
	error: string | null;
	/** links /ingest reported, keyed by index into the scan's ingestable matches */
	links: Array<{ matchIndex: number; link: IngestedMatchLink }>;
}

/**
 * One-go sender for the VoD tab's "Send results": POSTs as many matches per
 * request as the server cap allows — usually the whole scan, so sendou.ink's
 * content-based tournament resolution sees the full match sequence. No
 * per-event status bookkeeping (VoD events don't live in the live feed store);
 * resending is safe, so a partial failure is simply retried whole.
 */
export async function sendVodResults(
	events: readonly DetectedEvent[],
	onProgress?: (sentMatches: number, totalMatches: number) => void,
): Promise<VodResultsSendReport> {
	const matches = ingestableMatches(events);

	let sentMatches = 0;
	let error: string | null = null;
	const links: VodResultsSendReport["links"] = [];
	const chunks = R.chunk(matches, MAX_MATCHES_PER_REQUEST);
	for (const [chunkIndex, request] of chunks.entries()) {
		const offset = chunkIndex * MAX_MATCHES_PER_REQUEST;
		try {
			const response = await postIngestMatches(request);
			for (const linked of response.linkedMatches ?? []) {
				links.push({
					matchIndex: offset + linked.matchIndex,
					link: linked.link,
				});
			}
			sentMatches += request.length;
			onProgress?.(sentMatches, matches.length);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}
	return { sentMatches, totalMatches: matches.length, error, links };
}

/** The number of matches a set of events would send to /ingest. */
export function countIngestableMatches(
	events: readonly DetectedEvent[],
): number {
	return ingestableMatches(events).length;
}

/** Match selector: the match built from the given stored event. */
export function matchContaining(
	id: number,
): (built: BuiltMatch<StoredEvent>) => boolean {
	return (built) => built.sources.some((e) => e.id === id);
}

/**
 * The single send status a match displays, folded from its source events: an
 * in-flight send wins, then failure, then success, then queued; within a
 * state the most recent change is shown.
 */
export function aggregateSendStatus(
	sources: readonly StoredEvent[],
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
export function unsentMatches(built: BuiltMatch<StoredEvent>): boolean {
	return !built.sources.some(
		(e) => e.send?.state === "sent" || e.send?.state === "sending",
	);
}

/** Match selector: matches stored without a game to link to, whose next retry is due. */
export function retryableUnlinkedMatches(
	built: BuiltMatch<StoredEvent>,
): boolean {
	const status = aggregateSendStatus(built.sources);
	if (status?.state !== "unlinked") return false;

	const delay = UNLINKED_RETRY_DELAYS_MS[(status.attempts ?? 1) - 1];
	return delay !== undefined && Date.now() - status.at >= delay;
}

function ingestableMatches(events: readonly DetectedEvent[]): ScannerMatch[] {
	return ingestableBuilt(buildScannerMatches(events)).map(
		(built) => built.match,
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
	events: readonly StoredEvent[],
	allBuilt: BuiltMatch<StoredEvent>[],
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
	if (orphaned.length > 0) await updateEventsSend(orphaned, undefined);
}

async function errorText(res: Response): Promise<string> {
	const text = await res.text().catch(() => "");
	return `POST /ingest -> ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}
