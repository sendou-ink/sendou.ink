/**
 * The header's scanner panel fed by the real capture. Loaded lazily by the
 * header the first time its popover opens: this is what pulls the capture's
 * code in on pages other than the scanner's own.
 */
import { useUser } from "~/features/auth/core/user";
import type { ScannerActivityState } from "../scanner-activity";
import { useClips } from "./clips-feed";
import { currentSession, findSession, useFeed } from "./events-feed";
import {
	settleClipStore,
	startCapture,
	stopCapture,
	useLiveSession,
} from "./live-session";
import { ScannerActivityPanel } from "./ScannerActivityPanel";
import { aggregateSendStatus } from "./sendou-ingest";
import { setUploadUser } from "./upload";

/** a game is "being read" while its newest event is this fresh */
const READING_WINDOW_MS = 60_000;

export function ScannerActivityLive() {
	const live = useLiveSession();
	const feed = useFeed();
	const clips = useClips();
	const user = useUser();

	const session = live.status === "running" ? currentSession(feed) : null;
	const built = session?.built ?? [];
	const sendStates = built.map(
		(match) => aggregateSendStatus(match.sources)?.state,
	);
	const newest = built.at(-1);
	const isReading =
		newest !== undefined &&
		newest.match.winner === null &&
		Date.now() - (session?.endedAt ?? 0) < READING_WINDOW_MS;
	const latestScore = newest?.match.objective?.samples.findLast(
		(sample) => sample.score[0] !== null && sample.score[1] !== null,
	)?.score as [number, number] | undefined;

	const activity: ScannerActivityState = {
		status: live.status,
		error: live.error,
		since: live.since,
		sourceName: live.stream?.getVideoTracks()[0]?.label || null,
		stream: live.stream,
		game:
			isReading && newest
				? {
						mode: newest.match.mode,
						stageId: newest.match.stage,
						score: latestScore ?? null,
					}
				: null,
		uploadingCount: sendStates.filter((state) => state === "sending").length,
		stats:
			live.status === "running"
				? {
						games: built.length,
						uploaded: sendStates.filter(
							(state) => state === "sent" || state === "unlinked",
						).length,
						clips: clips.filter(
							(clip) =>
								clip.bucket === "session" &&
								clip.source.kind === "live" &&
								session !== null &&
								findSession(feed, clip.source.sessionKey) === session,
						).length,
					}
				: null,
	};

	return (
		<ScannerActivityPanel
			activity={activity}
			actions={{
				start: () => {
					// the capture uploads as the user, which the scanner page otherwise tells it
					setUploadUser(user ? { id: user.id } : null);
					settleClipStore();
					void startCapture();
				},
				stop: stopCapture,
			}}
		/>
	);
}
