/**
 * A scanned file's clips, cut apart from the scan so changing the clip
 * criteria re-reads the saved scan instead of the video: clips still wanted
 * are kept, the others deleted and the missing ones cut off the file (a
 * packet copy, well under a second each). A newer cut takes over from a
 * running one at its next clip. The file itself is needed, so a scan from an
 * earlier visit asks for it again.
 */
import { useSyncExternalStore } from "react";
import { usePersistedState } from "~/modules/persisted-state/hooks";
import * as PersistedState from "~/modules/persisted-state/persisted-state";
import { extractVodClip, vodFrameThumbnail } from "../capture/vod-clips";
import {
	type ClipCriteria,
	criteriaWindows,
	DEFAULT_VOD_CLIP_CRITERIA,
	maxSecondsFor,
	withDefaultCaps,
} from "../core/clips/criteria";
import { type ClipWindow, povDeathTimes } from "../core/clips/scoring";
import { buildScannerMatches } from "../core/match-builder";
import { vodClipCriteriaPersisted } from "../scanner-persisted";
import {
	deleteVodClips,
	listClips,
	type ScannerClip,
	saveClip,
} from "../store/clips";
import { refreshClips } from "./clips-feed";
import { describeError } from "./errors";
import type { ScanEvent } from "./session-data";
import { holdVisitLock, isThisVisitsVodClip, VISIT_ID } from "./visit";

/** A file's clips: the best windows over the whole scan, as many as fit history's cap. */
export const MAX_VOD_CLIPS = 20;

export type VodClipsWork =
	| { state: "cutting"; done: number; total: number }
	| {
			state: "done";
			/** windows meeting the criteria, `MAX_VOD_CLIPS` of them at most clipped */
			qualifying: number;
			error: string | null;
	  };

let works = new Map<string, VodClipsWork>();
const listeners = new Set<() => void>();
let latestRun = 0;
let queue: Promise<void> = Promise.resolve();

/** How cutting the file named `name` goes; null before its first cut this visit. */
export function useVodClipsWork(name: string): VodClipsWork | null {
	return useSyncExternalStore(
		subscribe,
		() => works.get(name) ?? null,
		() => null,
	);
}

/** The criteria a file's clips are cut by. */
export function useVodClipCriteria(): ClipCriteria {
	return withDefaultCaps(
		usePersistedState(vodClipCriteriaPersisted)[0],
		DEFAULT_VOD_CLIP_CRITERIA,
	);
}

function readVodClipCriteria(): ClipCriteria {
	return withDefaultCaps(
		PersistedState.read(vodClipCriteriaPersisted),
		DEFAULT_VOD_CLIP_CRITERIA,
	);
}

/** Saves new criteria; the caller re-cuts the clips it shows. */
export function updateVodClipCriteria(patch: Partial<ClipCriteria>): void {
	PersistedState.write(vodClipCriteriaPersisted, {
		...readVodClipCriteria(),
		...patch,
	});
}

/**
 * Brings the clips of the scan saved as `name` in line with the current
 * criteria, cutting them off `file`, and takes over from a cut still
 * running. Resolves once this cut is done or superseded.
 */
export function cutVodClips({
	name,
	file,
	events,
}: {
	name: string;
	file: File;
	events: readonly ScanEvent[];
}): Promise<void> {
	const run = ++latestRun;
	queue = queue.then(async () => {
		if (run !== latestRun) return;
		try {
			await cut(name, file, events, () => run !== latestRun);
		} catch (error) {
			setWork(name, {
				state: "done",
				qualifying: 0,
				error: describeError(error),
			});
		}
	});
	return queue;
}

/**
 * Stops a running cut at its next clip (the file's scan is being deleted).
 * Resolves once it has stopped, so clips deleted after it stay deleted.
 */
export function cancelVodClips(): Promise<void> {
	latestRun++;
	return queue;
}

async function cut(
	name: string,
	file: File,
	events: readonly ScanEvent[],
	superseded: () => boolean,
): Promise<void> {
	const criteria = readVodClipCriteria();
	const qualifying = buildScannerMatches(events, undefined, { unbacked: true })
		.flatMap((built) =>
			criteriaWindows(
				{ kills: built.match.kills, deaths: povDeathTimes(built.sources) },
				criteria,
			).map((window) => ({ window, built })),
		)
		.sort((a, b) => b.window.score - a.window.score);
	const wanted = qualifying.slice(0, MAX_VOD_CLIPS);
	const wantedKeys = new Set(wanted.map(({ window }) => clipKey(window)));

	// held before the first save, so another tab's page load never takes these for abandoned
	await holdVisitLock();
	const existingKeys = new Set(
		(await listClips())
			.filter((clip) => isThisVisitsVodClip(clip, name))
			.map(clipKey),
	);
	await deleteVodClips(
		(clip) => isThisVisitsVodClip(clip, name) && !wantedKeys.has(clipKey(clip)),
	);
	await refreshClips();
	const missing = wanted.filter(
		({ window }) => !existingKeys.has(clipKey(window)),
	);

	let skipped = 0;
	let error: string | null = null;
	setWork(name, { state: "cutting", done: 0, total: missing.length });
	// best first: one clip failing (or not fitting) still leaves room to try the rest
	for (const [index, { window, built }] of missing.entries()) {
		if (superseded()) {
			setWork(name, null);
			return;
		}
		try {
			const clip = await extractVodClip(file, {
				start: window.start,
				end: window.end,
				maxSeconds: maxSecondsFor(criteria, window.kills),
			});
			const thumbnail = (await vodFrameThumbnail(file, window.t)) ?? undefined;
			const stored = await saveClip(
				{
					createdAt: Date.now(),
					bucket: "vod",
					source: { kind: "vod", name, visit: VISIT_ID },
					start: clip.start,
					end: clip.end,
					t: window.t,
					time: window.time,
					score: window.score,
					kills: window.kills,
					mode: built.match.mode,
					stage: built.match.stage,
					hasAudio: clip.hasAudio,
					thumbnail,
				},
				clip.blob,
			);
			if (stored) {
				await refreshClips();
			} else {
				skipped++;
			}
		} catch (clipError) {
			error ??= describeError(clipError);
		}
		setWork(name, {
			state: "cutting",
			done: index + 1,
			total: missing.length,
		});
	}
	setWork(name, {
		state: "done",
		qualifying: qualifying.length,
		error:
			error ??
			(skipped > 0
				? `${skipped} ${skipped === 1 ? "clip" : "clips"} left out, storage is full`
				: null),
	});
}

/** A window is its run of kills: the last one and how many lead up to it. */
function clipKey(clip: Pick<ScannerClip | ClipWindow, "t" | "kills">): string {
	return `${clip.t}:${clip.kills}`;
}

function setWork(name: string, work: VodClipsWork | null): void {
	works = new Map(works);
	if (work) works.set(name, work);
	else works.delete(name);
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
