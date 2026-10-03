/**
 * The clip list every view reads (landing strip, session strips, clip
 * history), refreshed after each save/delete/roll and readable through a hook.
 */
import { useSyncExternalStore } from "react";
import { listClips, type ScannerClip } from "../store/clips";

const EMPTY: ScannerClip[] = [];

let clips: ScannerClip[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
let refreshing: Promise<void> | null = null;

export function refreshClips(): Promise<void> {
	refreshing ??= listClips()
		.then((next) => {
			clips = next;
		})
		.catch(() => {
			// storage unavailable: the strips stay empty
		})
		.finally(() => {
			refreshing = null;
			loaded = true;
			for (const listener of listeners) listener();
		});
	return refreshing;
}

/** Every clip, best first; loads on first use. */
export function useClips(): ScannerClip[] {
	return useSyncExternalStore(subscribe, getClips, () => EMPTY);
}

/** The list as last loaded, for the controllers; loads on first use. */
export function getClips(): ScannerClip[] {
	if (!loaded && !refreshing) void refreshClips();
	return clips;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
