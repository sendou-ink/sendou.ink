/** The saved VoD list every view reads (landing sessions list, a VoD's header), refreshed after saves and deletes. */
import { useSyncExternalStore } from "react";
import { listVods, type VodSummary } from "../store/vods";

const EMPTY: VodSummary[] = [];

let vods: VodSummary[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
let refreshing: Promise<void> | null = null;

export function refreshVods(): Promise<void> {
	refreshing ??= listVods()
		.then((next) => {
			vods = next;
		})
		.catch(() => {})
		.finally(() => {
			refreshing = null;
			loaded = true;
			for (const listener of listeners) listener();
		});
	return refreshing;
}

/** Every saved VoD, newest first; loads on first use. */
export function useVods(): VodSummary[] {
	return useSyncExternalStore(subscribe, getVods, () => EMPTY);
}

function getVods(): VodSummary[] {
	if (!loaded && !refreshing) void refreshVods();
	return vods;
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
