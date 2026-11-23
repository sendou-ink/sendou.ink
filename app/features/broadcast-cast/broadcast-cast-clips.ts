import type { TFunction } from "i18next";
import * as React from "react";
import * as R from "remeda";
import type * as ClipTransfer from "~/features/broadcast/core/ClipTransfer";
import type { BroadcastTarget } from "~/features/scanner/scanner-activity";
import {
	listClips,
	loadClipBlob,
	type ScannerClip,
} from "~/features/scanner/store/clips";
import type { BroadcastClip, CastBroadcastState } from "./broadcast-cast-types";

// the capture may run in another tab, which can't tell this one it cut a clip
const SCANNER_CLIPS_REFRESH_MS = 3_000;
const CLIPS_ON_OVERLAYS = 5;

/**
 * The clips this browser's scanner cut while following the broadcast, newest first. Only the browser running the
 * scanner has them, so elsewhere (or with `broadcast` `null`, a browser that never captured) this is empty.
 */
export function useScannerClips(broadcast: BroadcastTarget | null) {
	const [clips, setClips] = React.useState<ScannerClip[]>([]);
	const tournamentId = broadcast?.tournamentId ?? null;
	const slug = broadcast?.slug ?? null;

	React.useEffect(() => {
		if (tournamentId === null || slug === null) return;

		let isCancelled = false;
		const refresh = () =>
			listClips()
				.then((all) => {
					if (!isCancelled) setClips(clipsFor(all, { tournamentId, slug }));
				})
				.catch(() => {
					// storage unavailable: no clips to pick
				});
		void refresh();
		const interval = setInterval(refresh, SCANNER_CLIPS_REFRESH_MS);

		return () => {
			isCancelled = true;
			clearInterval(interval);
		};
	}, [tournamentId, slug]);

	return broadcast ? clips : [];
}

/** The scanner's clip as the replays scene plays it. */
export function broadcastClipOf(clip: ScannerClip): BroadcastClip {
	return {
		id: broadcastClipId(clip),
		durationMs: Math.round((clip.end - clip.start) * 1000),
		kills: clip.kills,
		moments: clip.moments ?? ["splats"],
	};
}

/**
 * The clips the overlays hold, in the order they get them: the ones the live, next and queued items play, then the
 * ones picked lately (picking one again plays it right away) and the newest cut (the likeliest picks), at most
 * `CLIPS_ON_OVERLAYS` unless more are picked. A clip is tens of MB, each overlay holding it in memory.
 */
export function useClipSources(
	state: CastBroadcastState,
	scannerClips: ScannerClip[],
): ClipTransfer.ClipSource[] {
	const pickedIds = R.unique(
		[state.live, state.next, ...state.queue].flatMap((item) =>
			item.scene === "replays" && item.clip ? [item.clip.id] : [],
		),
	);
	const [recentIds, setRecentIds] = React.useState<string[]>([]);
	const nextRecentIds = recentClipIds({ pickedIds, recentIds });
	if (!R.isDeepEqual(nextRecentIds, recentIds)) setRecentIds(nextRecentIds);

	const byId = new Map(
		scannerClips.map((clip) => [broadcastClipId(clip), clip]),
	);
	const keptIds = keptClipIds({
		pickedIds,
		recentIds: nextRecentIds,
		storedIds: scannerClips.map(broadcastClipId),
	});

	return keptIds.map((id) => {
		const clip = byId.get(id)!;

		return {
			id,
			kind: "clip",
			load: async () => {
				const blob = await loadClipBlob(clip.id);
				if (!blob) throw new Error("The clip was deleted");

				return blob;
			},
		};
	});
}

/**
 * The clips picked lately, latest first: the picked ones then the ones picked before, at most `CLIPS_ON_OVERLAYS`.
 * @internal
 */
export function recentClipIds({
	pickedIds,
	recentIds,
}: {
	pickedIds: string[];
	recentIds: string[];
}) {
	return R.unique([...pickedIds, ...recentIds]).slice(0, CLIPS_ON_OVERLAYS);
}

/**
 * The clips the overlays hold, see `useClipSources`: the picked ones, then the recently picked and the newest stored
 * (`storedIds` newest first), only stored ones, at most `CLIPS_ON_OVERLAYS` unless more are picked.
 * @internal
 */
export function keptClipIds({
	pickedIds,
	recentIds,
	storedIds,
}: {
	pickedIds: string[];
	recentIds: string[];
	storedIds: string[];
}) {
	const pickedStoredCount = pickedIds.filter((id) =>
		storedIds.includes(id),
	).length;

	return R.unique([...pickedIds, ...recentIds, ...storedIds])
		.filter((id) => storedIds.includes(id))
		.slice(0, Math.max(CLIPS_ON_OVERLAYS, pickedStoredCount));
}

/** What the clip shows, e.g. "Triple splat + Lead taken". */
export function broadcastClipTitle(
	t: TFunction<["broadcast"]>,
	clip: Pick<BroadcastClip, "kills" | "moments">,
) {
	return clip.moments
		.map((moment) => {
			if (moment === "lead") return t("broadcast:dashboard.clips.lead");
			if (moment === "push") return t("broadcast:dashboard.clips.push");
			if (clip.kills === 2) return t("broadcast:dashboard.clips.double");
			if (clip.kills === 3) return t("broadcast:dashboard.clips.triple");

			return t("broadcast:dashboard.clips.splats", { kills: clip.kills });
		})
		.join(" + ");
}

// the store's ids restart in another browser, the time it was cut tells two clips with one id apart
function broadcastClipId(clip: ScannerClip) {
	return `${clip.id}-${clip.createdAt}`;
}

/**
 * The live clips cut for the broadcast, newest first.
 * @internal
 */
export function clipsFor(clips: ScannerClip[], broadcast: BroadcastTarget) {
	return clips
		.filter(
			(clip) =>
				clip.source.kind === "live" &&
				clip.broadcast?.tournamentId === broadcast.tournamentId &&
				clip.broadcast.slug === broadcast.slug,
		)
		.sort((a, b) => b.createdAt - a.createdAt);
}
