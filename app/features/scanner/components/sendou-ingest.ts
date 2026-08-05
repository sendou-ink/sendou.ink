/**
 * Browser client for sendou.ink's /ingest. The scanner pages run inside
 * sendou.ink itself, so requests are same-origin: the session cookie rides
 * along automatically and the logged-in user comes from the root loader
 * (useUser) instead of an identity probe. sendou.ink authenticates the
 * session user and resolves the tournament/match from the events'
 * timestamps server-side.
 *
 * Sending is per match batch (core/batches.ts): the send unit is one
 * batch, and every member event's IndexedDB record tracks the outcome (the
 * `send` status the feed cards display).
 */
import { buildIngestBatches, chunkIngestBatches } from "../core/batches";
import { SCOREBOARD_REPLAY_EVENT_TYPE } from "../core/detectors/scoreboard-replay/index";
import type { DetectedEvent } from "../core/detectors/types";
import { parseReplayTimestamp } from "../core/replay-time";
import { type StoredEvent, updateEventsSend } from "../store/events";

const INGEST_URL = "/ingest";

/** /ingest accepts at most 1000 events per request */
const MAX_EVENTS_PER_REQUEST = 1000;

export interface SendouUser {
	id: number;
	username: string;
}

export interface SendResult {
	sentBatches: number;
	failedBatches: number;
}

/**
 * Groups the stored events into match batches, POSTs the ones `include`
 * selects, and records the outcome on every member event's `send` status
 * (calling `onStatus` after each store write so the feed can refresh).
 *
 * Resends are safe: sendou.ink dedupes events by content hash and
 * scoreboards first-ingest-wins, so a retry always re-sends its whole batch.
 */
export async function sendBatches({
	events,
	include,
	onStatus,
}: {
	events: readonly StoredEvent[];
	include: (batch: StoredEvent[]) => boolean;
	onStatus: () => void;
}): Promise<SendResult> {
	const allBatches = buildIngestBatches(
		events.filter((e) => e.id !== undefined),
	);
	const batches = allBatches.filter(include);
	await clearOrphanedQueued(events, allBatches);

	const result: SendResult = { sentBatches: 0, failedBatches: 0 };
	for (const batch of batches) {
		const ids = batch.map((e) => e.id!);
		await updateEventsSend(ids, { state: "sending", at: Date.now() });
		onStatus();
		try {
			await postIngestBatch(batch);
			await updateEventsSend(ids, { state: "sent", at: Date.now() });
			result.sentBatches++;
		} catch (err) {
			await updateEventsSend(ids, {
				state: "failed",
				at: Date.now(),
				error: err instanceof Error ? err.message : String(err),
			});
			result.failedBatches++;
		}
		onStatus();
	}
	return result;
}

export interface VodResultsSendReport {
	sentBatches: number;
	totalBatches: number;
	/** last failure's message; null when every batch went through */
	error: string | null;
}

/**
 * One-go sender for the VoD tab's "Upload as results": groups a completed
 * scan's events into match batches and POSTs as many batches per request as
 * the server cap allows — usually the whole scan in one request, so
 * sendou.ink's content-based tournament resolution sees the full scoreboard
 * sequence (its mode+stage order plus roster sides is near-unique in the
 * user's history). No per-event status bookkeeping — VoD events don't live
 * in the live feed store. Resending is safe (server-side dedupe), so a
 * partial failure can simply be retried whole.
 *
 * VoD events carry no per-event wall-clock; `detectedAt` is just the send
 * stamp, like the Live tab's — resolution relies on the sequence (and on a
 * replay scoreboard's own `recordedAt` where present).
 */
export async function sendVodResults(
	events: readonly DetectedEvent[],
	onProgress?: (sentBatches: number, totalBatches: number) => void,
): Promise<VodResultsSendReport> {
	const batches = buildIngestBatches(events);
	const requests = chunkIngestBatches(batches, MAX_EVENTS_PER_REQUEST);
	const detectedAt = Date.now();

	let sentBatches = 0;
	let error: string | null = null;
	for (const request of requests) {
		try {
			await postIngestBatch(request.flat().map((e) => ({ ...e, detectedAt })));
			sentBatches += request.length;
			onProgress?.(sentBatches, batches.length);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		}
	}
	return { sentBatches, totalBatches: batches.length, error };
}

/** The number of /ingest match batches a set of events would produce. */
export function countIngestBatches(events: readonly DetectedEvent[]): number {
	return buildIngestBatches(events).length;
}

async function postIngestBatch(
	batch: Array<DetectedEvent & { detectedAt?: number }>,
) {
	const res = await fetch(INGEST_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			events: batch.slice(0, MAX_EVENTS_PER_REQUEST).map(payloadEvent),
		}),
	});
	if (!res.ok) {
		throw new Error(
			res.status === 401 ? "not logged in to sendou.ink" : await errorText(res),
		);
	}
}

/**
 * Live sending marks events "queued" as they arrive; ones the grouping later
 * drops (non-private match, older than the fallback window) would sit
 * "queued" forever. Once a scoreboard boundary has passed them they can
 * never join a future batch, so clear their status back to "not sent".
 */
async function clearOrphanedQueued(
	events: readonly StoredEvent[],
	allBatches: StoredEvent[][],
): Promise<void> {
	const lastBoundaryT = Math.max(
		...allBatches.map((b) => b.at(-1)!.t),
		Number.NEGATIVE_INFINITY,
	);
	const batchedIds = new Set(allBatches.flat().map((e) => e.id));
	const orphaned = events
		.filter(
			(e) =>
				e.send?.state === "queued" &&
				e.id !== undefined &&
				!batchedIds.has(e.id) &&
				e.t <= lastBoundaryT,
		)
		.map((e) => e.id!);
	if (orphaned.length > 0) await updateEventsSend(orphaned, undefined);
}

/** Batch selector: the batch that carries the given stored event. */
export function batchContaining(id: number): (batch: StoredEvent[]) => boolean {
	return (batch) => batch.some((e) => e.id === id);
}

/** Batch selector: batches not yet sent (nor currently sending). */
export function unsentBatches(batch: StoredEvent[]): boolean {
	return !batch.some(
		(e) => e.send?.state === "sent" || e.send?.state === "sending",
	);
}

function payloadEvent(event: DetectedEvent & { detectedAt?: number }) {
	const recordedAt =
		event.type === SCOREBOARD_REPLAY_EVENT_TYPE
			? replayRecordedAt(
					event.data as { timestamp: string | null },
					event.detectedAt,
				)
			: null;
	return {
		type: event.type,
		t: event.t,
		detectedAt: event.detectedAt,
		confidence: event.confidence,
		data: event.data, // worker events are persisted without debug
		...(recordedAt !== null ? { recordedAt } : null),
	};
}

/** The replay's recording time as UTC ms, from the on-screen timestamp. */
function replayRecordedAt(
	data: { timestamp: string | null },
	detectedAt: number | undefined,
): number | null {
	// anchor the day/month recency disambiguation to when the replay screen
	// was seen, not to a possibly much later send/retry
	return data.timestamp
		? parseReplayTimestamp(data.timestamp, { now: detectedAt })
		: null;
}

async function errorText(res: Response): Promise<string> {
	const text = await res.text().catch(() => "");
	return `POST /ingest -> ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`;
}
