/**
 * Clip persistence: records in `clips` (listing never touches video), MP4s
 * in `clip-blobs` under the record id. Three buckets: `session` holds the
 * running live session's clips (nothing evicted while you play), `history`
 * keeps the `MAX_HISTORY_CLIPS` best across sessions (lowest score replaced
 * when full — download to keep), and `vod` holds a scanned file's clips for
 * this visit only (purged on the next page load; the file is on disk).
 */
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { CLIP_BLOBS_STORE, CLIPS_STORE, readwrite, tx } from "./db";

export const MAX_HISTORY_CLIPS = 20;

export type ClipBucket = "session" | "history" | "vod";

export type ClipSource =
	| { kind: "live"; sessionKey: number }
	| { kind: "vod"; name: string };

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
}

export type ClipToSave = Omit<ScannerClip, "id">;

export async function saveClip(
	clip: ClipToSave,
	blob: Blob,
): Promise<ScannerClip> {
	let saved: ScannerClip | null = null;
	await readwrite([CLIPS_STORE, CLIP_BLOBS_STORE], (transaction) => {
		const add = transaction
			.objectStore(CLIPS_STORE)
			.add(clip) as IDBRequest<number>;
		add.onsuccess = () => {
			saved = { ...clip, id: add.result };
			transaction.objectStore(CLIP_BLOBS_STORE).put(blob, add.result);
		};
	});
	return saved!;
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
function byScore(a: ScannerClip, b: ScannerClip): number {
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

/** Drops every VoD clip (a new visit starts without them) or one file's. */
export function deleteVodClips(name?: string): Promise<void> {
	return readwrite([CLIPS_STORE, CLIP_BLOBS_STORE], (transaction) => {
		const clips = transaction.objectStore(CLIPS_STORE);
		const blobs = transaction.objectStore(CLIP_BLOBS_STORE);
		const req = clips.index("bucket").openCursor(IDBKeyRange.only("vod"));
		req.onsuccess = () => {
			const cursor = req.result;
			if (!cursor) return;
			const clip = cursor.value as ScannerClip;
			if (
				name === undefined ||
				(clip.source.kind === "vod" && clip.source.name === name)
			) {
				blobs.delete(cursor.primaryKey);
				cursor.delete();
			}
			cursor.continue();
		};
	});
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
