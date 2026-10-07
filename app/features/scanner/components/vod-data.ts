/**
 * A saved scan's events off the store and the match builds of a file's events,
 * shared by the views that open a scanned file (`view=vod`, `view=coach`).
 */
import { useEffect, useState } from "react";
import { type BuiltMatch, buildScannerMatches } from "../core/match-builder";
import { loadVod, loadVodEvents, type VodSummary } from "../store/vods";
import type { ScanEvent } from "./session-data";

/**
 * Builds keyed by the events array: views re-render for reasons other than new
 * events (clips), and reusing the same `BuiltMatch` objects lets
 * the unchanged cards skip rendering.
 */
const builtCache = new WeakMap<readonly ScanEvent[], BuiltMatch<ScanEvent>[]>();

type StoredVod =
	| { state: "loading" }
	| { state: "missing" }
	| {
			state: "ready";
			summary: VodSummary;
			events: ScanEvent[];
	  };

/** Loads a saved VoD's summary and events. */
export function useStoredVod(name: string): StoredVod {
	const [loaded, setLoaded] = useState<{
		name: string;
		summary: VodSummary | undefined;
		events: ScanEvent[];
	} | null>(null);

	// the store is outside React: read it when the name changes
	useEffect(() => {
		let stale = false;
		void Promise.all([loadVod(name), loadVodEvents(name)]).then(
			([summary, events]) => {
				if (!stale) setLoaded({ name, summary, events });
			},
		);
		return () => {
			stale = true;
		};
	}, [name]);

	if (!loaded || loaded.name !== name) return { state: "loading" };
	if (!loaded.summary) return { state: "missing" };
	return {
		state: "ready",
		summary: loaded.summary,
		events: loaded.events,
	};
}

/** `events` built into matches, the same objects for the same array. */
export function cachedBuild(
	events: readonly ScanEvent[],
): BuiltMatch<ScanEvent>[] {
	const cached = builtCache.get(events);
	if (cached) return cached;
	const built = buildScannerMatches(events);
	builtCache.set(events, built);
	return built;
}
