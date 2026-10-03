/**
 * The landing: title, a "How it works" disclosure, two entry cards (Live / File), the clip history strip and
 * the sessions list. Anyone can capture, scan files and get clips locally;
 * only uploading (live captures) needs a login. Dropping a file anywhere here starts a scan;
 * an image opens the screenshot view instead, through the same handoff
 * Inspect uses.
 */
import clsx from "clsx";
import { Play, Upload } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { LocaleTime } from "~/components/LocaleTime";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import {
	useSearchParam,
	useSearchParamsTyped,
} from "~/modules/search-params/hooks";
import { SCANNER_PAGE } from "~/utils/urls";
import { sessionByKey } from "../core/sessions";
import { scannerSearchParams } from "../scanner-search-params";
import { MAX_HISTORY_CLIPS, type ScannerClip } from "../store/clips";
import { newInspectKey, putInspectFrame } from "../store/inspect";
import { ClipDialog } from "./ClipDialog";
import { ClipStrip } from "./ClipStrip";
import { useClips } from "./clips-feed";
import { useFeed } from "./events-feed";
import styles from "./LandingView.module.css";
import { getLiveSession, startCapture, useLiveSession } from "./live-session";
import { SettingsPopover } from "./SettingsPopover";
import { SourceSelect } from "./SourceSelect";
import { useDebug } from "./use-debug";
import { isThisVisitsVodClip } from "./visit";
import { startVodScan } from "./vod-scan";
import { useVods } from "./vods-feed";

/** how many history clips the landing strip shows before "See all" */
const LANDING_CLIPS = 8;

type SessionRow =
	| {
			kind: "live";
			key: number;
			startedAt: number;
			endedAt: number;
			clips: number;
	  }
	| {
			kind: "vod";
			name: string;
			savedAt: number;
			clips: number;
	  };

export function LandingView() {
	const live = useLiveSession();
	const feed = useFeed();
	const vods = useVods();
	const clips = useClips();
	const [telemetry] = useSearchParam(scannerSearchParams, "telemetry");
	const debug = useDebug();
	const [, setParams] = useSearchParamsTyped(scannerSearchParams);
	const [over, setOver] = useState(false);
	const [playing, setPlaying] = useState<ScannerClip | null>(null);

	const canCapture = supportsCapture();
	const history = clips.filter((clip) => clip.bucket === "history");
	const rows = sessionRows(feed.sessions, vods, clips);

	const startLive = async () => {
		if (live.status === "running") {
			setParams({ view: "live" });
			return;
		}
		await startCapture({ saveFrames: debug });
		if (getLiveSession().status === "running") setParams({ view: "live" });
	};

	const scanFile = (file: File) => {
		if (file.type.startsWith("image/")) {
			void inspectScreenshot(file);
			return;
		}
		void startVodScan(file, { telemetry, saveFrames: debug });
		setParams({ view: "vod", name: file.name });
	};

	const inspectScreenshot = async (file: File) => {
		const key = newInspectKey();
		await putInspectFrame(key, file);
		setParams({ view: "debug", inspect: key });
	};

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target for the whole landing; the file input is the accessible path
		<div
			className={clsx(styles.landing, { [styles.over]: over })}
			onDragOver={(e) => {
				e.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				const file = e.dataTransfer.files[0];
				if (file) scanFile(file);
			}}
		>
			<header className={styles.header}>
				<div className={styles.titleRow}>
					<h1 className={styles.title}>Scanner</h1>
					<SettingsPopover />
				</div>
				<HowItWorks />
			</header>

			<div className={styles.cards}>
				<section className={styles.card}>
					<h2 className={styles.cardTitle}>
						<Play size={16} aria-hidden />
						Live
					</h2>
					<p className={styles.cardText}>
						{canCapture
							? "Watch your capture card while you play. Results upload as each game ends."
							: "Needs a desktop browser and a capture card."}
					</p>
					<div className={styles.cardActions}>
						<SendouButton
							icon={<Play />}
							isDisabled={!canCapture || live.status === "starting"}
							onClick={() => void startLive()}
						>
							{live.status === "running"
								? "Open live session"
								: live.status === "starting"
									? "Starting…"
									: "Start capture"}
						</SendouButton>
						{canCapture ? (
							<SourceSelect disabled={live.status !== "idle"} />
						) : null}
					</div>
					{live.status === "error" && live.error ? (
						<p className={styles.error}>{live.error}</p>
					) : null}
				</section>
				<section className={styles.card}>
					<h2 className={styles.cardTitle}>
						<Upload size={16} aria-hidden />
						File
					</h2>
					<p className={styles.cardText}>
						Scan a recorded VoD, or a screenshot to see what the scanner reads
						from it.
					</p>
					<label className={styles.dropzone}>
						Drop a video or screenshot here or{" "}
						<span className={styles.choose}>choose file</span>
						<input
							type="file"
							accept="video/*,image/*"
							className={styles.fileInput}
							onChange={(e) => {
								const file = e.target.files?.[0];
								e.target.value = ""; // allow re-picking the same file
								if (file) scanFile(file);
							}}
						/>
					</label>
				</section>
			</div>

			<ClipStrip
				title="Clip history"
				count={`${history.length} / ${MAX_HISTORY_CLIPS}`}
				clips={history.slice(0, LANDING_CLIPS)}
				onPlay={setPlaying}
				seeAllHref={scannerSearchParams.href(SCANNER_PAGE, { view: "clips" })}
			/>

			<section className={styles.sessions}>
				<h2 className={styles.sectionTitle}>Sessions</h2>
				{rows.length === 0 ? (
					<p className={styles.empty}>
						{feed.loaded
							? "Your sessions show up here once you have played with the scanner running."
							: ""}
					</p>
				) : (
					<div className={styles.rows}>
						{rows.map((row) => (
							<SessionRowItem key={rowKey(row)} row={row} />
						))}
					</div>
				)}
			</section>

			{playing ? (
				<ClipDialog clip={playing} onClose={() => setPlaying(null)} />
			) : null}
		</div>
	);
}

function HowItWorks() {
	return (
		<details className={styles.howItWorks}>
			<summary>How it works</summary>
			<dl className={styles.facts}>
				<dt>What you need</dt>
				<dd>
					A desktop browser and a capture card sending the game as a full-screen
					feed. Recorded VoDs don't need a capture card. Clipping live captures
					needs a Chromium browser (Chrome, Edge, Brave…).
				</dd>
				<dt>What gets read</dt>
				<dd>
					The mode, stage and lobby, the scoreboard (names, weapons, splats,
					deaths, specials, paint and the result), the kill feed, objective
					progress and who is alive or has their special ready.
				</dd>
				<dt>Privacy</dt>
				<dd>
					Everything is processed on your computer. Video never leaves the
					browser, and sessions and clips are saved in this browser only. This
					also means you should always download any data you want to keep.
				</dd>
				<dt>What gets uploaded</dt>
				<dd>
					Only when you are logged in and upload is on in the settings, and only
					from live captures: the reads of your Private Battles (and X Battles)
					are sent as each game ends, never any video. Private Battles played in
					SendouQ or a tournament get linked to their match once it is reported
					and show up on that match's page. Other lobbies are never uploaded.
				</dd>
			</dl>
		</details>
	);
}

function SessionRowItem({ row }: { row: SessionRow }) {
	const href =
		row.kind === "live"
			? scannerSearchParams.href(SCANNER_PAGE, {
					view: "session",
					id: row.key,
				})
			: scannerSearchParams.href(SCANNER_PAGE, {
					view: "vod",
					name: row.name,
				});
	return (
		<Link to={href} className={styles.row} defaultShouldRevalidate={false}>
			<span className={styles.rowTitle}>
				{row.kind === "live" ? (
					<LocaleTimeRange
						from={new Date(row.startedAt)}
						to={new Date(row.endedAt)}
						options={{ dateStyle: "medium", timeStyle: "short" }}
						inline
					/>
				) : (
					<>
						<span className={styles.rowName}>{row.name}</span>
						<span className={styles.tag}>VoD</span>
						<LocaleTime
							date={new Date(row.savedAt)}
							options={{ dateStyle: "medium" }}
							inline
							className={styles.rowDate}
						/>
					</>
				)}
			</span>
			<span className={styles.rowStats}>
				{row.clips > 0
					? `${row.clips} ${row.clips === 1 ? "clip" : "clips"}`
					: null}
			</span>
		</Link>
	);
}

function rowKey(row: SessionRow): string {
	return row.kind === "live" ? `live-${row.key}` : `vod-${row.name}`;
}

function sessionRows(
	sessions: ReturnType<typeof useFeed>["sessions"],
	vods: ReturnType<typeof useVods>,
	clips: readonly ScannerClip[],
): SessionRow[] {
	const liveRows: SessionRow[] = sessions.map((session) => ({
		kind: "live",
		key: session.key,
		startedAt: session.startedAt,
		endedAt: session.endedAt,
		clips: clips.filter(
			(clip) =>
				clip.source.kind === "live" &&
				sessionByKey(sessions, clip.source.sessionKey) === session,
		).length,
	}));
	const vodRows: SessionRow[] = vods.map((vod) => ({
		kind: "vod",
		name: vod.name,
		savedAt: vod.savedAt,
		clips: clips.filter((clip) => isThisVisitsVodClip(clip, vod.name)).length,
	}));
	return [...liveRows, ...vodRows].sort((a, b) => rowTime(b) - rowTime(a));
}

function rowTime(row: SessionRow): number {
	return row.kind === "live" ? row.endedAt : row.savedAt;
}

/** A desktop browser with camera access; phones can't drive a capture card. */
function supportsCapture(): boolean {
	return (
		typeof navigator !== "undefined" &&
		Boolean(navigator.mediaDevices?.getUserMedia) &&
		typeof OffscreenCanvas !== "undefined" &&
		!matchMedia("(pointer: coarse) and (max-width: 900px)").matches
	);
}
