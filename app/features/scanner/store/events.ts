/**
 * IndexedDB store of live detections: one `events` store keyed by auto id,
 * indexed by timestamp, with a small thumbnail per event; the full-res
 * analyzed PNG lives in the separate `frames` store under the same id
 * (loadEventFrame) so listing the feed never deserializes megabytes of
 * blobs. Retention runs on save (throttled): whole sessions past
 * `core/sessions.ts`'s age/count/event limits go, and frames go after
 * `FRAME_MAX_AGE_MS` or past `MAX_FRAMES` (the events stay, marked frameless).
 */
import type { IngestedMatchLink } from "~/features/scanner-ingest/scanner-ingest-schemas";
import type { DetectedEvent } from "../core/detectors/types";
import { expiredSessionEventIds } from "../core/sessions";
import { EVENTS_STORE, FRAMES_STORE, readwrite, tx } from "./db";

/**
 * Full-res frame PNGs (~1-2MB each) are what makes a misread reportable; only
 * debug-mode captures save them, bounded by age and count, whichever bites first.
 */
const MAX_FRAMES = 200;
const FRAME_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/** The retention pass walks every key; once a minute is plenty for limits measured in days. */
const RETENTION_INTERVAL_MS = 60_000;

/** Where an event stands with sendou.ink /ingest; absent = never attempted. */
export interface SendStatus {
	/** "unlinked": sendou.ink stored the match but its game is not reported yet — resent on a backoff */
	state: "sending" | "sent" | "unlinked" | "failed";
	/** wall-clock time of the last state change */
	at: number;
	/** failure detail, set when state is "failed" */
	error?: string;
	/** the sendou.ink match /ingest linked the sent match to, when it reported one */
	link?: IngestedMatchLink;
	/** how many times the match came back unlinked, set while state is "unlinked" */
	attempts?: number;
}

export interface StoredEvent {
	id?: number;
	type: string;
	/** seconds — wall-clock seconds for live captures, seconds into the file for VoDs */
	t: number;
	/** wall-clock time of detection */
	detectedAt: number;
	confidence: number;
	data: unknown;
	/** small JPEG data URL of the source frame */
	thumbnail?: string;
	/** whether a full-res frame exists in the `frames` store under this id */
	hasFrame?: boolean;
	send?: SendStatus;
}

let lastRetentionAt = 0;

/**
 * Persists a detection; resolves to its store id. `reuseId` overwrites that row
 * (and its frame) so an event a better read replaces keeps a stable id.
 */
export async function saveEvent(
	event: DetectedEvent,
	thumbnail?: string,
	frame?: Blob,
	reuseId?: number,
): Promise<number> {
	const record: StoredEvent = {
		...(reuseId !== undefined ? { id: reuseId } : null),
		type: event.type,
		t: event.t,
		detectedAt: Date.now(),
		confidence: event.confidence,
		data: event.data,
		thumbnail,
		hasFrame: frame !== undefined,
	};
	let id = 0;
	await readwrite([EVENTS_STORE, FRAMES_STORE], (transaction) => {
		const events = transaction.objectStore(EVENTS_STORE);
		const frames = transaction.objectStore(FRAMES_STORE);
		const add = events.put(record) as IDBRequest<number>;
		add.onsuccess = () => {
			id = add.result;
			if (frame) frames.put(frame, id);
			else if (reuseId !== undefined) frames.delete(id);
			const now = Date.now();
			if (now - lastRetentionAt >= RETENTION_INTERVAL_MS) {
				lastRetentionAt = now;
				retain(events, frames, now);
			}
		};
	});
	return id;
}

/** Runs the retention pass now (page load, capture start/stop). */
export function trimEvents(): Promise<void> {
	lastRetentionAt = Date.now();
	return readwrite([EVENTS_STORE, FRAMES_STORE], (transaction) =>
		retain(
			transaction.objectStore(EVENTS_STORE),
			transaction.objectStore(FRAMES_STORE),
			Date.now(),
		),
	);
}

/**
 * Session and frame retention over key cursors only (no record is
 * deserialized): the `detectedAt` index yields every event's id and time,
 * which splits the sessions and dates each frame.
 */
function retain(
	events: IDBObjectStore,
	frames: IDBObjectStore,
	now: number,
): void {
	const stamps: { id: number; detectedAt: number }[] = [];
	const cursor = events.index("detectedAt").openKeyCursor();
	cursor.onsuccess = () => {
		const c = cursor.result;
		if (c) {
			stamps.push({ id: c.primaryKey as number, detectedAt: c.key as number });
			c.continue();
			return;
		}
		const expired = new Set(expiredSessionEventIds(stamps, now));
		for (const id of expired) {
			events.delete(id);
			frames.delete(id);
		}
		const detectedAtById = new Map(
			stamps
				.filter((stamp) => !expired.has(stamp.id))
				.map((stamp) => [stamp.id, stamp.detectedAt] as const),
		);
		retainFrames(events, frames, detectedAtById, now);
	};
}

function retainFrames(
	events: IDBObjectStore,
	frames: IDBObjectStore,
	detectedAtById: Map<number, number>,
	now: number,
): void {
	const ids: number[] = [];
	const cursor = frames.openKeyCursor(); // ascending id = oldest first
	cursor.onsuccess = () => {
		const c = cursor.result;
		if (c) {
			ids.push(c.primaryKey as number);
			c.continue();
			return;
		}
		const excess = Math.max(0, ids.length - MAX_FRAMES);
		for (const [index, id] of ids.entries()) {
			const detectedAt = detectedAtById.get(id);
			const stale =
				detectedAt === undefined || now - detectedAt > FRAME_MAX_AGE_MS;
			if (!stale && index >= excess) continue;
			frames.delete(id);
			const get = events.get(id) as IDBRequest<StoredEvent | undefined>;
			get.onsuccess = () => {
				const record = get.result;
				if (!record?.hasFrame) return;
				record.hasFrame = false;
				events.put(record);
			};
		}
	};
}

/** Sets (or clears) the send status of the given events in one transaction; `storeName` picks the live or VoD store. */
export async function updateEventsSend(
	ids: number[],
	send: SendStatus | undefined,
	storeName: string = EVENTS_STORE,
): Promise<void> {
	await readwrite([storeName], (transaction) => {
		const events = transaction.objectStore(storeName);
		for (const id of ids) {
			const get = events.get(id) as IDBRequest<StoredEvent | undefined>;
			get.onsuccess = () => {
				const record = get.result;
				if (!record) return; // evicted meanwhile
				if (send) record.send = send;
				else delete record.send;
				events.put(record);
			};
		}
	});
}

/** Deletes the given events and their frames in one transaction. */
export async function deleteEvents(ids: number[]): Promise<void> {
	await readwrite([EVENTS_STORE, FRAMES_STORE], (transaction) => {
		const events = transaction.objectStore(EVENTS_STORE);
		const frames = transaction.objectStore(FRAMES_STORE);
		for (const id of ids) {
			events.delete(id);
			frames.delete(id);
		}
	});
}

/** Events detected at or after `since` (wall-clock ms), every event by default. */
export function listEvents(since = 0): Promise<StoredEvent[]> {
	return tx(
		EVENTS_STORE,
		"readonly",
		(store) =>
			store
				.index("detectedAt")
				.getAll(IDBKeyRange.lowerBound(since)) as IDBRequest<StoredEvent[]>,
	);
}

/** The event's full-res analyzed PNG, or undefined when none was stored. */
export function loadEventFrame(id: number): Promise<Blob | undefined> {
	return tx(
		FRAMES_STORE,
		"readonly",
		(store) => store.get(id) as IDBRequest<Blob | undefined>,
	);
}
