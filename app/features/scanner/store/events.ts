/**
 * IndexedDB store of live detections: one `events` store keyed by auto id,
 * indexed by timestamp; the full-res analyzed frame lives in the separate
 * `frames` store under the same id (loadEventFrame) so listing the feed never
 * deserializes megabytes of blobs. Retention runs on save (throttled): whole
 * sessions past `core/sessions.ts`'s age/count/event limits go, then the
 * frames past `frames.ts`'s age and size budget (the events stay, marked frameless).
 */
import type { IngestedMatchLink } from "~/features/scanner-ingest/scanner-ingest-schemas";
import type { DetectedEvent } from "../core/detectors/types";
import { expiredSessionEventIds } from "../core/sessions";
import { EVENTS_STORE, FRAMES_STORE, readwrite, tx } from "./db";
import { trimFrames } from "./frames";

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
	/** how many sends in a row came back unlinked or failed, set while state is "unlinked" or "failed" */
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
		hasFrame: frame !== undefined,
	};
	let id = 0;
	let retained = false;
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
				retainSessions(events, frames, now);
				retained = true;
			}
		};
	});
	if (retained) void trimFrames().catch(() => {});
	return id;
}

/** Runs the retention pass now (page load, capture start/stop). */
export async function trimEvents(): Promise<void> {
	lastRetentionAt = Date.now();
	await readwrite([EVENTS_STORE, FRAMES_STORE], (transaction) =>
		retainSessions(
			transaction.objectStore(EVENTS_STORE),
			transaction.objectStore(FRAMES_STORE),
			Date.now(),
		),
	);
	await trimFrames();
}

/**
 * Session retention over key cursors only (no record is deserialized): the
 * `detectedAt` index yields every event's id and time, which splits the sessions.
 */
function retainSessions(
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
		for (const id of expiredSessionEventIds(stamps, now)) {
			events.delete(id);
			frames.delete(id);
		}
	};
}

/** Sets (or clears) the send status of the given events in one transaction. */
export async function updateEventsSend(
	ids: number[],
	send: SendStatus | undefined,
): Promise<void> {
	await readwrite([EVENTS_STORE], (transaction) => {
		const events = transaction.objectStore(EVENTS_STORE);
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

/** The stored events among `ids`, read over their id range; ids no longer stored are left out. */
export async function getEvents(
	ids: readonly number[],
): Promise<StoredEvent[]> {
	if (ids.length === 0) return [];
	const wanted = new Set(ids);
	const inRange = await tx(
		EVENTS_STORE,
		"readonly",
		(store) =>
			store.getAll(
				IDBKeyRange.bound(
					ids.reduce((a, b) => Math.min(a, b)),
					ids.reduce((a, b) => Math.max(a, b)),
				),
			) as IDBRequest<StoredEvent[]>,
	);
	return inRange.filter((event) => wanted.has(event.id!));
}

/** The event's full-res analyzed frame, or undefined when none was stored. */
export function loadEventFrame(id: number): Promise<Blob | undefined> {
	return tx(
		FRAMES_STORE,
		"readonly",
		(store) => store.get(id) as IDBRequest<Blob | undefined>,
	);
}
