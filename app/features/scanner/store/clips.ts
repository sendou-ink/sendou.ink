/**
 * Clip persistence: records in `clips` (listing never touches video), MP4s
 * in `clip-blobs` under the record id. Three buckets: `session` holds the
 * running live session's clips (kept until Stop), `history` keeps the
 * `MAX_HISTORY_CLIPS` best across sessions (lowest score replaced when full —
 * download to keep), and `vod` holds a scanned file's clips for the visit
 * that cut them only (the file is on disk; see visit.ts). Bytes are budgeted
 * too: the live clips (session and history together) stay under
 * `LIVE_CLIPS_MAX_BYTES` and each file's clips under `VOD_CLIPS_MAX_BYTES`,
 * the lowest-scoring going first, and no
 * clip is saved into the quota the events need.
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { CLIP_BLOBS_STORE, CLIPS_STORE, readwrite, tx } from "./db";

export const MAX_HISTORY_CLIPS = 20;
/** ~90 typical session clips on top of a full history */
export const LIVE_CLIPS_MAX_BYTES = 4_000_000_000;
/** a file's clips keep its bitrate (~5 MB/s at 40 Mbps) but only live for one visit */
const VOD_CLIPS_MAX_BYTES = 2_000_000_000;
/** quota a clip save leaves free, so the games' events keep saving */
const STORAGE_RESERVE_BYTES = 250_000_000;
/** clips saved before their size was kept were all encoded at 16 Mbps */
const LEGACY_BYTES_PER_SECOND = 2_000_000;

export type ClipBucket = "session" | "history" | "vod";

export type ClipSource =
	| { kind: "live"; sessionKey: number }
	/** `visit`: the page load that cut it (see visit.ts) */
	| { kind: "vod"; name: string; visit: string };

export interface ScannerClip {
	id: number;
	createdAt: number;
	bucket: ClipBucket;
	source: ClipSource;
	/** seconds into the stream/file the clip really starts at */
	start: number;
	/** seconds into the stream/file the clip really ends at */
	end: number;
	/** seconds into the stream/file of the window's last kill — the clip's anchor */
	t: number;
	/** that kill's match timer reading, when read */
	time: number | null;
	score: number;
	kills: number;
	mode: ModeShort | null;
	stage: StageId | null;
	hasAudio: boolean;
	/** small JPEG data URL */
	thumbnail?: string;
	/** the MP4's size; absent on clips saved before it was kept */
	bytes?: number;
}

export type ClipToSave = Omit<ScannerClip, "id" | "bytes">;

/**
 * Saves the clip, making room in its byte budget by dropping its group's
 * lowest-scoring clips. Resolves to null, saving nothing, when the clip
 * itself does not make the cut or would eat into the quota the events need.
 */
export async function saveClip(
	clip: ClipToSave,
	blob: Blob,
	{
		maxBytes = clip.source.kind === "live"
			? LIVE_CLIPS_MAX_BYTES
			: VOD_CLIPS_MAX_BYTES,
	} = {},
): Promise<ScannerClip | null> {
	if (!(await hasRoomFor(blob.size))) return null;
	let saved: ScannerClip | null = null;
	await readwrite([CLIPS_STORE, CLIP_BLOBS_STORE], (transaction) => {
		const clips = transaction.objectStore(CLIPS_STORE);
		const blobs = transaction.objectStore(CLIP_BLOBS_STORE);
		const getAll = clips.getAll() as IDBRequest<ScannerClip[]>;
		getAll.onsuccess = () => {
			const incoming = { ...clip, bytes: blob.size };
			const group = getAll.result.filter((other) =>
				sameBudget(other.source, clip.source),
			);
			const dropped = overBudget([...group, incoming], maxBytes);
			if (dropped.includes(incoming)) return;
			for (const other of dropped as ScannerClip[]) {
				clips.delete(other.id);
				blobs.delete(other.id);
			}
			const add = clips.add(incoming) as IDBRequest<number>;
			add.onsuccess = () => {
				saved = { ...incoming, id: add.result };
				blobs.put(blob, add.result);
			};
		};
	});
	return saved;
}

/** Every clip, best first (score, then newest). */
export async function listClips(): Promise<ScannerClip[]> {
	const clips = await tx(
		CLIPS_STORE,
		"readonly",
		(store) => store.getAll() as IDBRequest<ScannerClip[]>,
	);
	return clips.sort(byScore);
}

/** Sort order of every clip list: best first, newest breaks ties. */
function byScore(
	a: Pick<ScannerClip, "score" | "createdAt">,
	b: Pick<ScannerClip, "score" | "createdAt">,
): number {
	return b.score - a.score || b.createdAt - a.createdAt;
}

/** The clip's MP4, or undefined when it was deleted meanwhile. */
export function loadClipBlob(id: number): Promise<Blob | undefined> {
	return tx(
		CLIP_BLOBS_STORE,
		"readonly",
		(store) => store.get(id) as IDBRequest<Blob | undefined>,
	);
}

export function deleteClip(id: number): Promise<void> {
	return readwrite([CLIPS_STORE, CLIP_BLOBS_STORE], (transaction) => {
		transaction.objectStore(CLIPS_STORE).delete(id);
		transaction.objectStore(CLIP_BLOBS_STORE).delete(id);
	});
}

/**
 * Session end: the session bucket rolls into history, where the cap applies —
 * the lowest-scoring clips beyond `MAX_HISTORY_CLIPS` are evicted, session
 * clips competing on equal terms. Resolves to the number evicted.
 */
export async function rollSessionClipsIntoHistory(): Promise<number> {
	let evicted = 0;
	await readwrite([CLIPS_STORE, CLIP_BLOBS_STORE], (transaction) => {
		const clips = transaction.objectStore(CLIPS_STORE);
		const blobs = transaction.objectStore(CLIP_BLOBS_STORE);
		const getAll = clips.getAll() as IDBRequest<ScannerClip[]>;
		getAll.onsuccess = () => {
			const history = getAll.result
				.filter((clip) => clip.bucket !== "vod")
				.map((clip) => ({ ...clip, bucket: "history" as const }))
				.sort(byScore);
			for (const [index, clip] of history.entries()) {
				if (index < MAX_HISTORY_CLIPS) {
					clips.put(clip);
				} else {
					clips.delete(clip.id);
					blobs.delete(clip.id);
					evicted++;
				}
			}
		};
	});
	return evicted;
}

/** Drops the VoD clips `drop` picks. */
export function deleteVodClips(
	drop: (clip: ScannerClip) => boolean,
): Promise<void> {
	return readwrite([CLIPS_STORE, CLIP_BLOBS_STORE], (transaction) => {
		const clips = transaction.objectStore(CLIPS_STORE);
		const blobs = transaction.objectStore(CLIP_BLOBS_STORE);
		const req = clips.index("bucket").openCursor(IDBKeyRange.only("vod"));
		req.onsuccess = () => {
			const cursor = req.result;
			if (!cursor) return;
			if (drop(cursor.value as ScannerClip)) {
				blobs.delete(cursor.primaryKey);
				cursor.delete();
			}
			cursor.continue();
		};
	});
}

/** Live clips share one budget, a file's clips (per visit) another. */
function sameBudget(a: ClipSource, b: ClipSource): boolean {
	if (a.kind === "live" || b.kind === "live") return a.kind === b.kind;
	return a.name === b.name && a.visit === b.visit;
}

/** The clips that do not fit `maxBytes` when kept best first. */
function overBudget<T extends Omit<ScannerClip, "id">>(
	clips: readonly T[],
	maxBytes: number,
): T[] {
	let total = 0;
	return clips.toSorted(byScore).filter((clip) => {
		const bytes =
			clip.bytes ?? (clip.end - clip.start) * LEGACY_BYTES_PER_SECOND;
		if (total + bytes > maxBytes) return true;
		total += bytes;
		return false;
	});
}

/** Whether `bytes` more still leaves the reserve free; true where the browser cannot tell. */
async function hasRoomFor(bytes: number): Promise<boolean> {
	const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
	if (estimate?.quota === undefined || estimate.usage === undefined) {
		return true;
	}
	return estimate.quota - estimate.usage - bytes >= STORAGE_RESERVE_BYTES;
}

/** Bytes the origin uses, per the browser's estimate; null where unsupported. */
export async function storageUsage(): Promise<number | null> {
	if (!navigator.storage?.estimate) return null;
	const estimate = await navigator.storage.estimate();
	return estimate.usage ?? null;
}

/** Asks the browser to keep this origin's storage out of best-effort eviction. */
export function requestPersistentStorage(): void {
	void navigator.storage?.persist?.().catch(() => {});
}
