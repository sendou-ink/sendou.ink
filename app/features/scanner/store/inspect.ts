/**
 * Cross-tab frame handoff for the Inspect action: the source tab stashes the
 * frame under a fresh key and opens the screenshot page in a new browser tab
 * with ?inspect=<key>. The write races the new tab's load, so claiming polls
 * briefly before giving up. Claimed records are deleted; unclaimed leftovers
 * (blocked popup, tab closed mid-load) are swept by key age on the next
 * handoff.
 */

import { INSPECT_FRAMES_STORE, tx } from "./db";

const CLAIM_ATTEMPTS = 20;
const CLAIM_RETRY_MS = 150;
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Fresh handoff key; the fixed-width timestamp prefix keys the stale sweep. */
export function newInspectKey(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Stash a frame for the tab that was opened with this key. */
export async function putInspectFrame(key: string, frame: Blob): Promise<void> {
	await tx(INSPECT_FRAMES_STORE, "readwrite", (store) =>
		store.delete(IDBKeyRange.upperBound(String(Date.now() - STALE_AFTER_MS))),
	);
	await tx(INSPECT_FRAMES_STORE, "readwrite", (store) => store.put(frame, key));
}

/** Take (and delete) the frame stashed under this key, polling the write race. */
export async function claimInspectFrame(key: string): Promise<Blob | null> {
	for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
		if (attempt > 0) await delay(CLAIM_RETRY_MS);
		const frame = await tx<Blob | undefined>(
			INSPECT_FRAMES_STORE,
			"readonly",
			(store) => store.get(key),
		);
		if (frame) {
			await tx(INSPECT_FRAMES_STORE, "readwrite", (store) => store.delete(key));
			return frame;
		}
	}
	return null;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
