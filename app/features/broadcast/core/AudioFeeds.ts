import type { BroadcastAudioFeed } from "../broadcast-types";

/** An overlay reporting nothing for this long is gone, e.g. OBS closed it before its channel noticed. */
const STALE_REPORT_MS = 2_000;

interface Report {
	feeds: BroadcastAudioFeed[];
	receivedAt: number;
}

export type Store = ReturnType<typeof createStore>;

/**
 * Keeps the audio feeds the overlays report to the dashboard, by feed id: connected when any overlay reporting it
 * hears it connected, as loud as the loudest of them. A feed no overlay reports (anymore) is left out. Read with
 * `useSyncExternalStore`, so only what shows the feeds re-renders as they come in several times a second.
 */
export function createStore() {
	const reports = new Map<string, Report>();
	const listeners = new Set<() => void>();
	let feeds: ReadonlyMap<number, BroadcastAudioFeed> = new Map();
	let staleCheck: ReturnType<typeof setInterval> | null = null;

	const update = () => {
		const now = Date.now();
		for (const [peerId, report] of reports) {
			if (now - report.receivedAt > STALE_REPORT_MS) reports.delete(peerId);
		}
		feeds = merge(reports.values());
		for (const listener of listeners) listener();
	};

	return {
		/** The overlay's latest feeds, `null` once it's gone. */
		report(peerId: string, reported: BroadcastAudioFeed[] | null) {
			if (reported) {
				reports.set(peerId, { feeds: reported, receivedAt: Date.now() });
			} else if (!reports.delete(peerId)) {
				return;
			}

			update();
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			staleCheck ??= setInterval(() => {
				if (reports.size > 0) update();
			}, STALE_REPORT_MS / 2);

			return () => {
				listeners.delete(listener);
				if (listeners.size === 0 && staleCheck) {
					clearInterval(staleCheck);
					staleCheck = null;
				}
			};
		},
		getSnapshot: () => feeds,
	};
}

function merge(reports: Iterable<Report>) {
	const feeds = new Map<number, BroadcastAudioFeed>();
	for (const report of reports) {
		for (const feed of report.feeds) {
			const other = feeds.get(feed.id);
			feeds.set(
				feed.id,
				other
					? {
							id: feed.id,
							isConnected: other.isConnected || feed.isConnected,
							loudness: Math.max(other.loudness, feed.loudness),
						}
					: feed,
			);
		}
	}

	return feeds;
}
