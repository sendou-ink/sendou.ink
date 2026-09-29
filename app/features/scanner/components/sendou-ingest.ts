/**
 * Browser client for sendou.ink's /ingest. The scanner runs inside sendou.ink,
 * so requests are same-origin: the session cookie rides along and the
 * logged-in user comes from the root loader (useUser); the server resolves
 * the tournament/match. The unit of accounting is one ScannerMatch
 * (core/match-builder.ts) — every live source event's IndexedDB record tracks
 * its outcome (the `send` status the match cards display) — while
 * the unit of transport is a request of up to `MAX_MATCHES_PER_REQUEST`.
 * Resends are safe: sendou.ink dedupes by content hash, merges partials, and
 * scoreboards are first-ingest-wins.
 */

import * as R from "remeda";
import type { IngestResponse } from "~/features/scanner-ingest/scanner-ingest-schemas";
import { SCOREBOARD_EVENT_TYPES } from "../core/detectors/registry";
import type { DetectedEvent } from "../core/detectors/types";
import type { BuiltMatch } from "../core/match-builder";
import { ingestSkipReasons } from "../core/match-builder";
import type { ScannerMatch } from "../core/scanner-match";
import type { SendStatus } from "../store/events";
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

/** A request sendou.ink hasn't answered by then fails, so a hung one can't hold up the sends queued behind it. */
const INGEST_TIMEOUT_MS = 30_000;

/**
 * A "sending" status older than this was cut off (the tab closed mid-request)
 * and counts as failed. Outlives any live request, which the timeout bounds.
 */
const STALE_SENDING_MS = 2 * INGEST_TIMEOUT_MS;

/** Browsers refuse keepalive requests over 64 KiB; bigger ones go out without it. */
const KEEPALIVE_MAX_BODY_BYTES = 64 * 1024;

export interface SendResult {
	sentMatches: number;
	failedMatches: number;
}

/**
 * POSTs the ingestable `matches` (a whole session or file, which
 * the skip rules look across) that `include` selects, and records the outcome
 * through `writeSend` (calling `onStatus` after each request's store writes).
 *
 * Matches go out in as few requests as the server cap allows: sendou.ink
 * resolves a whole request to one context, so a backlog spanning two links
 * the larger and leaves the rest "unlinked"; the retry carries only those,
 * which then resolve on their own.
 */
export async function sendMatches({
	matches,
	include,
	onStatus,
	writeSend,
}: {
	/** chronological */
	matches: readonly BuiltMatch<ScanEvent>[];
	include: (built: BuiltMatch<ScanEvent>) => boolean;
	onStatus: () => void;
	/** stores a send status on the given matches */
	writeSend: (
		matches: readonly BuiltMatch<ScanEvent>[],
		send: SendStatus,
	) => Promise<void>;
}): Promise<SendResult> {
	const selected = ingestableBuilt(matches).filter(include);

	const result: SendResult = { sentMatches: 0, failedMatches: 0 };
	for (const request of R.chunk(selected, MAX_MATCHES_PER_REQUEST)) {
		await writeSend(request, { state: "sending", at: Date.now() });
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
				await writeSend([built], {
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
			await writeSend(request, {
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

/** Match selector: the match built from the given stored event. */
export function matchContaining(
	id: number,
): (built: BuiltMatch<ScanEvent>) => boolean {
	return (built) => built.sources.some((e) => e.id === id);
}

/**
 * The single send status a match displays, folded from its source events: an
 * in-flight send wins, then failure, then success; within a state the most
 * recent change is shown. A send cut off mid-request shows as failed.
 */
export function aggregateSendStatus(
	sources: readonly ScanEvent[],
): SendStatus | undefined {
	const statuses = sources
		.map((e) => currentSendStatus(e.send))
		.filter((status) => status !== undefined);
	for (const state of ["sending", "failed", "unlinked", "sent"] as const) {
		const ofState = statuses.filter((status) => status.state === state);
		if (ofState.length > 0) {
			return ofState.reduce((a, b) => (a.at >= b.at ? a : b));
		}
	}
	return undefined;
}

/** Match selector: matches not yet sent (nor currently sending). */
export function unsentMatches(built: BuiltMatch<ScanEvent>): boolean {
	return !built.sources.some((e) => {
		const state = currentSendStatus(e.send)?.state;
		return state === "sent" || state === "sending";
	});
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
		built.sources.every((e) => e.send === undefined)
	);
}

function currentSendStatus(
	status: SendStatus | undefined,
): SendStatus | undefined {
	if (
		status?.state !== "sending" ||
		Date.now() - status.at < STALE_SENDING_MS
	) {
		return status;
	}
	return {
		state: "failed",
		at: status.at,
		error: "the upload was interrupted before sendou.ink answered",
	};
}

function ingestableBuilt<E extends DetectedEvent>(
	built: readonly BuiltMatch<E>[],
): BuiltMatch<E>[] {
	const skipped = ingestSkipReasons(built);
	return built.filter((match) => !skipped.has(match));
}

async function postIngestMatches(
	matches: ScannerMatch[],
): Promise<IngestResponse> {
	const body = new TextEncoder().encode(JSON.stringify({ matches }));
	try {
		const res = await fetch(INGEST_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
			signal: AbortSignal.timeout(INGEST_TIMEOUT_MS),
			// lets the send finish when the tab closes right after Stop
			keepalive: body.byteLength <= KEEPALIVE_MAX_BODY_BYTES,
		});
		if (!res.ok) {
			throw new Error(
				res.status === 401
					? "not logged in to sendou.ink"
					: await errorText(res),
			);
		}
		return await res.json();
	} catch (err) {
		if (err instanceof DOMException && err.name === "TimeoutError") {
			throw new Error("sendou.ink didn't answer in time", { cause: err });
		}
		throw err;
	}
}

async function errorText(res: Response): Promise<string> {
	const text = await res.text().catch(() => "");
	return `POST /ingest -> ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}
