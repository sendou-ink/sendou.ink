/**
 * The running capture: the past-session screen with a live header — the
 * capture preview, the LIVE/IDLE status line, Stop — over the same
 * SessionView. The capture itself lives in live-session.ts and outlives this view.
 */
import { Camera, Square } from "lucide-react";
import { SendouButton } from "~/components/elements/Button";
import { LocaleTime } from "~/components/LocaleTime";
import { useUser } from "~/features/auth/core/user";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { modeLabel, stageLabel } from "../core/labels";
import { scannerSearchParams } from "../scanner-search-params";
import { loadEventFrame } from "../store/events";
import { useClips } from "./clips-feed";
import { ExportMenu } from "./ExportMenu";
import { currentSession, useFeed } from "./events-feed";
import styles from "./LiveView.module.css";
import {
	saveCurrentFrameAsFixture,
	stopCapture,
	useLiveSession,
} from "./live-session";
import { SessionHeader } from "./SessionHeader";
import { SessionView } from "./SessionView";
import { SettingsPopover, sessionLabel } from "./SettingsPopover";
import { matchContaining } from "./sendou-ingest";
import type { ScanEvent } from "./session-data";
import { useScannerSettings } from "./settings";
import { sendLive } from "./upload";
import { useDebug } from "./use-debug";

/** a game is "being read" while its newest event is this fresh */
const READING_WINDOW_MS = 60_000;

export function LiveView() {
	const live = useLiveSession();
	const feed = useFeed();
	const clips = useClips();
	const settings = useScannerSettings();
	const user = useUser();
	const [, setParams] = useSearchParamsTyped(scannerSearchParams);
	const debug = useDebug();

	const session = currentSession(feed);
	const events = session?.events ?? [];
	const sessionClips = clips.filter((clip) => clip.bucket === "session");
	const newest = session?.built.at(-1);
	const reading =
		newest !== undefined &&
		newest.match.winner === null &&
		Date.now() - (session?.endedAt ?? 0) < READING_WINDOW_MS;
	const uploadNote = !user
		? "Upload off · log in"
		: settings.upload
			? "Upload on ✓"
			: "Upload off";
	const clipsNote =
		live.clips === "on"
			? live.hasAudio
				? "Clips on · Audio ✓"
				: `Clips on · no audio${live.audioError ? ` (${live.audioError})` : ""}`
			: live.clips === "unsupported"
				? "Clips need a Chromium browser"
				: live.clips === "failed"
					? "Clips unavailable for this source"
					: "Clips off";

	const stop = () => {
		stopCapture();
		setParams({ view: "home" });
	};

	return (
		<SessionView
			kind="live"
			events={events}
			originT={session?.originT ?? 0}
			clips={sessionClips}
			clipsTitle="Clips this session"
			running
			canUpload={Boolean(user)}
			onUpload={(built) => {
				const id = built.sources[0]?.id;
				if (id !== undefined) void sendLive(matchContaining(id));
			}}
			getFrame={frameLoader}
			emptyText="Play a game — it shows up here as soon as its intro or results screen is read."
			header={(info) => (
				<SessionHeader
					actions={
						<>
							<ExportMenu
								built={info.built}
								events={events}
								source={{
									label: sessionLabel(session?.startedAt ?? live.since ?? 0),
									originT: session?.originT ?? 0,
								}}
								clipCounts={info.clipCounts}
								fileBase={`scanner-${new Date(session?.startedAt ?? Date.now()).toISOString().slice(0, 10)}`}
							/>
							{debug ? (
								<SendouButton
									size="small"
									variant="minimal"
									icon={<Camera />}
									onClick={saveCurrentFrameAsFixture}
								>
									Save frame as fixture
								</SendouButton>
							) : null}
							<SendouButton
								size="small"
								variant="destructive"
								icon={<Square />}
								onClick={stop}
							>
								Stop
							</SendouButton>
							<SettingsPopover />
						</>
					}
				>
					<div className={styles.liveHeader}>
						<video
							ref={(video) => {
								if (video && video.srcObject !== live.stream) {
									video.srcObject = live.stream;
								}
							}}
							className={styles.preview}
							muted
							playsInline
							autoPlay
						/>
						<div className={styles.status}>
							<div className={styles.statusLine}>
								{reading && newest ? (
									<span className={styles.game}>
										{[
											modeLabel(newest.match.mode),
											stageLabel(newest.match.stage),
										]
											.filter(Boolean)
											.join(" · ")}
									</span>
								) : null}
							</div>
							<div className={styles.meta}>
								{live.since !== null ? (
									<>
										since{" "}
										<LocaleTime
											date={new Date(live.since)}
											options={{ timeStyle: "short" }}
											inline
										/>
									</>
								) : null}
								{info.summaryLine ? ` · ${info.summaryLine}` : null}
							</div>
							<div className={styles.notes}>
								{uploadNote} · {clipsNote}
							</div>
							{live.error ? (
								<div className={styles.error}>{live.error}</div>
							) : null}
						</div>
					</div>
				</SessionHeader>
			)}
		/>
	);
}

function frameLoader(event: ScanEvent) {
	return event.hasFrame && event.id !== undefined
		? () => loadEventFrame(event.id!)
		: undefined;
}
