/**
 * The clip list every view reads (landing strip, session strips, clip
 * history), refreshed after each save/delete/roll and readable through a hook.
 */
import { useSyncExternalStore } from "react";
import { formatPosition } from "../core/format";
import { clipTitle } from "../core/labels";
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

/** The clip's download name: its file's name (or the day it was cut live), position and what it shows. */
export function clipFileName(clip: ScannerClip): string {
	const source =
		clip.source.kind === "vod"
			? clip.source.name.replace(/\.[^.]+$/, "")
			: new Date(clip.createdAt).toISOString().slice(0, 10);
	const at = formatPosition(clip.t).replaceAll(":", "-");
	const shows = clipTitle(clip)
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "-");
	return `${source}-${at}-${shows}.mp4`;
}
