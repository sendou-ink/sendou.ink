/**
 * VoD tab: load a video file and scan it as fast as decoding allows — no
 * real-time playback. On the primary (WebCodecs) path the duration is split
 * into one contiguous slice per analyzer worker and each worker demuxes,
 * decodes, schedules and analyzes its slice itself (worker/analyzer.worker.ts):
 * no frames cross the main thread and calm stretches are skimmed by keyframe
 * hops. The seek fallback drives a <video> element through a single worker,
 * widening its stride over calm footage. Completed scans are persisted to
 * IndexedDB keyed by file name (store/vods.ts) and listed for reinspection.
 */
import clsx from "clsx";
import { Download, FileText, Send, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import * as R from "remeda";
import { SendouButton } from "~/components/elements/Button";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { GameTimeline } from "~/components/GameTimeline";
import { useSearchParam } from "~/modules/search-params/hooks";
import { openSeekScan, probeWebCodecs } from "../capture/vod-frames";
import { connectAbilities } from "../core/ability-harvest";
import { OBJECTIVE_EVENT_TYPE } from "../core/detectors/objective/index";
import { PLAYER_STATUS_EVENT_TYPE } from "../core/detectors/objective/player-status";
import { STRIP_WEAPONS_EVENT_TYPE } from "../core/detectors/objective/strip-weapons";
import {
	mergeScanTelemetry,
	type ScanTelemetry,
} from "../core/detectors/telemetry";
import type { DetectedEvent } from "../core/detectors/types";
import {
	buildScannerMatches,
	ingestSkipReasons,
	invalidObjectiveEvents,
} from "../core/match-builder";
import { TimelineBuilder } from "../core/timeline/index";
import { scannerSearchParams } from "../scanner-search-params";
import type { SendStatus } from "../store/events";
import {
	deleteVod,
	listVods,
	loadVodEventFrame,
	loadVodEvents,
	saveVod,
	saveVodResultsSend,
	type VodResultsSend,
	type VodSummary,
} from "../store/vods";
import {
	AnalyzerClient,
	type DoneInfo,
	defaultScanWorkerCount,
} from "../worker/client";
import { withoutRepeatEvents } from "./dedupe-events";
import { EventCard, type GetFrame } from "./EventCard";
import { EventsSummary } from "./EventsSummary";
import { downloadEventsCsv } from "./events-csv";
import type { FixtureData } from "./fixture-export";
import { formatTime, useEventDateTimeFormatter } from "./format";
import { MatchCard } from "./MatchCard";
import { MatchLobbyTabs } from "./MatchLobbyTabs";
import { playerStatusTeams } from "./player-status-view";
import {
	ScannerControls,
	ScannerDropzone,
	ScannerFeed,
	ScannerMenuButton,
	ScannerSplitLayout,
	ScannerStatusPill,
} from "./ScannerChrome";
import {
	countIngestableMatches,
	type SendouUser,
	sendVodResults,
} from "./sendou-ingest";
import { sendouUpload } from "./sendou-upload";
import { thumbnailFromBlob } from "./thumbnail";
import styles from "./VodPage.module.css";

/** The scan knows the on-screen sides only, not who is playing. */
const SCANNER_TEAM_LABELS = ["Alpha", "Bravo"] as const;

/** seek-fallback stride while the worker reports activity */
const SEEK_ACTIVE_STRIDE_S = 0.25;
/**
 * seek-fallback stride over calm footage — small enough that the screens that
 * start activity from dead air (results ~10s, match intro ~7s) still get sampled
 */
const SEEK_CALM_STRIDE_S = 2.5;

type Status = "idle" | "scanning" | "done" | "error";

interface VodMatch {
	event: DetectedEvent<FixtureData>;
	/**
	 * render identity, inherited when a better read replaces the event so match
	 * cards keyed on it don't remount (replaying the enter animation)
	 */
	key: number;
	thumbnail?: string;
	/** lossless PNG of the exact frame the detector analyzed (live scan) */
	frame?: Blob;
	/** stored VoD: id to load the frame from the vod-frames store */
	frameId?: number;
}

interface Progress {
	t: number;
	duration: number;
	/** scan speed as a multiple of realtime */
	rate: number;
}

/** "Send results" progress/outcome shown next to the button. */
type ResultsSend =
	| { state: "sending"; sent: number; total: number }
	| ({ state: "done" } & VodResultsSend);

export function VodPage({
	sendouUser,
}: {
	/** sendou.ink login shown in the header; undefined = probing, null = not logged in */
	sendouUser: SendouUser | null | undefined;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const previewRef = useRef<HTMLCanvasElement>(null);
	const clientsRef = useRef<AnalyzerClient[]>([]);
	// cancels the in-flight chunk scans of the previous scan, if any
	const abortScanRef = useRef<(() => void) | null>(null);
	// seek fallback: latest per-frame done info + the waiter for the next one
	const doneInfoRef = useRef<DoneInfo | null>(null);
	const frameDoneRef = useRef<(() => void) | null>(null);
	const timelineRef = useRef(new TimelineBuilder());
	// latest gate score from any worker; flushed to state on the UI throttle
	const gateScoreRef = useRef<number | null>(null);
	const abortRef = useRef({ aborted: false });
	const urlRef = useRef<string | null>(null);
	// source of truth for matches (state mirrors it) so the scan loop can
	// persist the final list without waiting on React
	const matchesRef = useRef<VodMatch[]>([]);
	// in-flight thumbnail work; awaited before persisting a finished scan
	const sideWorkRef = useRef<Promise<void>[]>([]);
	const nextMatchKeyRef = useRef(0);
	// telemetry collection is baked into the workers at init, so a change of
	// the search param needs a fresh pool
	const clientsCollectTelemetryRef = useRef(false);

	const [fileName, setFileName] = useState<string | null>(null);
	/** live scan vs. reopened saved VoD (no video element for the latter) */
	const [source, setSource] = useState<"scan" | "stored">("scan");
	const [status, setStatus] = useState<Status>("idle");
	const [method, setMethod] = useState<string | null>(null);
	const [gateScore, setGateScore] = useState<number | null>(null);
	const [progress, setProgress] = useState<Progress | null>(null);
	const [matches, setMatches] = useState<VodMatch[]>([]);
	const [vods, setVods] = useState<VodSummary[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [telemetry, setTelemetry] = useState<ScanTelemetry | null>(null);
	const [eventsOpen, setEventsOpen] = useState(false);
	const [resultsSend, setResultsSend] = useState<ResultsSend | null>(null);

	// opt-in via ?telemetry=true only; nothing in the UI links to it
	const [collectTelemetry] = useSearchParam(scannerSearchParams, "telemetry");

	const formatSavedAt = useEventDateTimeFormatter();

	const abilityMap = connectAbilities(matches.map((m) => m.event));

	const builtMatches = buildScannerMatches(matches.map((m) => m.event));
	const skipReasons = ingestSkipReasons(builtMatches);
	// mirrors sendVodResults' ingestable-match order, which the send outcome's
	// links are keyed by
	const ingestableBuilt = builtMatches.filter((b) => !skipReasons.has(b));
	const linkByIngestableIndex = new Map(
		(resultsSend?.state === "done" ? (resultsSend.links ?? []) : []).map(
			(linked) => [linked.matchIndex, linked.link] as const,
		),
	);
	const vodMatchByEvent = new Map(matches.map((m) => [m.event, m] as const));
	const groupedEvents = new Set(builtMatches.flatMap((b) => b.sources));
	// strip weapon evidence is assignment input, not a detection worth a card
	const ungroupedMatches = matches.filter(
		(m) =>
			!groupedEvents.has(m.event) && m.event.type !== STRIP_WEAPONS_EVENT_TYPE,
	);

	// "Send results" sends the whole scan in one go, so its outcome maps onto
	// every ingestable card; a partial failure can't be attributed per match
	const bulkSend: SendStatus | undefined =
		resultsSend?.state === "sending"
			? { state: "sending", at: 0 }
			: resultsSend?.state === "done" && resultsSend.error === null
				? { state: "sent", at: resultsSend.at }
				: resultsSend?.state === "done" && resultsSend.sent === 0
					? { state: "failed", at: resultsSend.at }
					: undefined;

	// only offered once the whole VoD has been processed (a stored VoD is a
	// completed scan by construction)
	const upload =
		status === "done" ? sendouUpload(matches.map((m) => m.event)) : null;

	// "Send results": the scan's ingestable ScannerMatches POSTed to /ingest in one go
	const resultsMatchCount =
		status === "done" ? countIngestableMatches(matches.map((m) => m.event)) : 0;

	const refreshVods = useCallback(async () => {
		try {
			setVods(await listVods());
		} catch {
			// listing failures are non-fatal; the scan UI still works
		}
	}, []);

	const uploadResults = async () => {
		const events = matchesRef.current.map((m) => m.event);
		setResultsSend({
			state: "sending",
			sent: 0,
			total: countIngestableMatches(events),
		});
		const report = await sendVodResults(events, (sent, total) =>
			setResultsSend({ state: "sending", sent, total }),
		);
		const outcome: VodResultsSend = {
			sent: report.sentMatches,
			total: report.totalMatches,
			error: report.error,
			at: Date.now(),
			links: report.links,
		};
		setResultsSend({ state: "done", ...outcome });
		// saved under its file name so the send outcome is restored when the VoD is reopened
		if (fileName) {
			await saveVodResultsSend(fileName, outcome);
			await refreshVods();
		}
	};

	useEffect(() => {
		void refreshVods();
		return () => {
			abortRef.current.aborted = true;
			abortScanRef.current?.();
			for (const client of clientsRef.current) client.dispose();
			clientsRef.current = [];
			if (urlRef.current) URL.revokeObjectURL(urlRef.current);
		};
	}, [refreshVods]);

	const scan = async (file: File) => {
		abortRef.current.aborted = true;
		abortScanRef.current?.();
		const abort = { aborted: false };
		abortRef.current = abort;

		setError(null);
		setTelemetry(null);
		setMatches([]);
		setResultsSend(null);
		setEventsOpen(false);
		setProgress(null);
		setGateScore(null);
		setMethod(null);
		setFileName(file.name);
		setSource("scan");
		setStatus("scanning");

		try {
			// the element is used by the seek fallback and for post-scan review
			const video = videoRef.current!;
			if (urlRef.current) URL.revokeObjectURL(urlRef.current);
			urlRef.current = URL.createObjectURL(file);
			video.src = urlRef.current;

			if (clientsCollectTelemetryRef.current !== collectTelemetry) {
				for (const client of clientsRef.current) client.dispose();
				clientsRef.current = [];
				clientsCollectTelemetryRef.current = collectTelemetry;
			}
			if (clientsRef.current.length === 0) {
				clientsRef.current = Array.from(
					{ length: defaultScanWorkerCount() },
					() =>
						new AnalyzerClient(
							(result) => {
								gateScoreRef.current = result.gate.score;
								if (!result.gate.pass) return;
								for (const event of result.events as DetectedEvent<FixtureData>[]) {
									const action = timelineRef.current.push(event);
									if (action.action !== "added" && action.action !== "replaced")
										continue;
									const frame = result.frame;
									sideWorkRef.current.push(
										(async () => {
											const thumbnail = frame
												? await thumbnailFromBlob(frame)
												: undefined;
											const replaced =
												action.action === "replaced"
													? matchesRef.current.find(
															(m) => m.event === action.replaced,
														)
													: undefined;
											const next = matchesRef.current.filter(
												(m) => m !== replaced,
											);
											next.push({
												event,
												key: replaced?.key ?? nextMatchKeyRef.current++,
												thumbnail,
												frame,
											});
											next.sort((a, b) => a.event.t - b.event.t);
											matchesRef.current = next;
											setMatches(next);
										})().catch(() => {}),
									);
								}
							},
							(message) => {
								frameDoneRef.current?.();
								frameDoneRef.current = null;
								setError(message);
								setStatus("error");
							},
							(_t, info: DoneInfo) => {
								doneInfoRef.current = info;
								frameDoneRef.current?.();
								frameDoneRef.current = null;
							},
							{ collectTelemetry },
						),
				);
			}
			const clients = clientsRef.current;
			await Promise.all(clients.map((c) => c.whenReady()));
			// let work still in flight from an aborted scan finish before the
			// timeline resets, so its results can't bleed into this scan
			await Promise.all(clients.map((c) => c.whenIdle()));
			if (abort.aborted) return;
			matchesRef.current = [];
			sideWorkRef.current = [];
			timelineRef.current = new TimelineBuilder();

			const started = performance.now();
			const finalize = async (duration: number) => {
				await Promise.all(sideWorkRef.current);
				if (abort.aborted) return;
				matchesRef.current = withoutInvalidObjectives(matchesRef.current);
				setMatches(matchesRef.current);
				setProgress((p) => (p ? { ...p, t: duration } : p));
				setStatus("done");
				await saveVod(
					{ name: file.name, savedAt: Date.now(), duration },
					matchesRef.current.map((m) => ({
						type: m.event.type,
						t: m.event.t,
						confidence: m.event.confidence,
						data: m.event.data,
						thumbnail: m.thumbnail,
						frame: m.frame,
					})),
				);
				await refreshVods();
			};

			const probe = await probeWebCodecs(file);
			if (abort.aborted) return;

			if (probe) {
				// each worker demuxes, decodes and analyzes its own slice of
				// the file; the main thread only aggregates progress
				setMethod("webcodecs");
				const { duration } = probe;
				const chunkSpan = duration / clients.length;
				const chunks = clients.map((client, i) => ({
					client,
					tStart: i * chunkSpan,
					tEnd: i === clients.length - 1 ? duration : (i + 1) * chunkSpan,
					t: i * chunkSpan,
					done: false,
					telemetry: null as ScanTelemetry | null,
				}));
				abortScanRef.current = () => {
					for (const client of clients) client.abortChunk();
				};
				const mergedTelemetry = () => {
					const parts = chunks.flatMap((c) =>
						c.telemetry ? [c.telemetry] : [],
					);
					return parts.length > 0 ? mergeScanTelemetry(parts) : null;
				};
				let lastUiUpdate = Number.NEGATIVE_INFINITY;
				const pushUiUpdate = () => {
					const now = performance.now();
					if (now - lastUiUpdate < 250) return;
					lastUiUpdate = now;
					const covered = R.sumBy(
						chunks,
						(c) => Math.min(c.t, c.tEnd) - c.tStart,
					);
					const elapsed = (now - started) / 1000;
					setGateScore(gateScoreRef.current);
					setProgress({
						t: covered,
						duration,
						rate: elapsed > 0 ? covered / elapsed : 0,
					});
					setTelemetry(mergedTelemetry());
				};
				await Promise.all(
					chunks.map((chunk, chunkIndex) =>
						chunk.client
							.scanChunk(
								{ file, chunkIndex, tStart: chunk.tStart, tEnd: chunk.tEnd },
								(progress) => {
									chunk.t = progress.t;
									chunk.telemetry = progress.telemetry;
									if (progress.preview) {
										// show one chunk at a time: the earliest still running
										if (chunks.find((c) => !c.done) === chunk) {
											drawPreview(previewRef.current, progress.preview);
										}
										progress.preview.close();
									}
									pushUiUpdate();
								},
							)
							.then((chunkTelemetry) => {
								chunk.done = true;
								chunk.t = chunk.tEnd;
								chunk.telemetry = chunkTelemetry;
							}),
					),
				);
				if (abort.aborted) return;
				setTelemetry(mergedTelemetry());
				await finalize(duration);
				return;
			}

			// seek fallback: one worker, one frame in flight; the worker's calm
			// signal widens the stride over dead air
			setMethod("seek");
			const strideRef = { current: SEEK_ACTIVE_STRIDE_S };
			const vod = await openSeekScan(video, () => strideRef.current);
			if (abort.aborted) return;
			const client = clients[0]!;
			let lastUiUpdate = Number.NEGATIVE_INFINITY;
			for await (const { frame, t } of vod.frames) {
				if (abort.aborted) {
					frame.close();
					break;
				}
				const now = performance.now();
				if (now - lastUiUpdate >= 250) {
					lastUiUpdate = now;
					// the preview draw must precede analyze — transferring the
					// frame to the worker detaches it
					drawPreview(previewRef.current, frame);
					setGateScore(gateScoreRef.current);
					const elapsed = (now - started) / 1000;
					setProgress({
						t,
						duration: vod.duration,
						rate: elapsed > 0 ? t / elapsed : 0,
					});
					if (doneInfoRef.current) setTelemetry(doneInfoRef.current.telemetry);
				}
				await new Promise<void>((resolve) => {
					frameDoneRef.current = resolve;
					if (!client.analyze(frame, t)) resolve();
				});
				strideRef.current = doneInfoRef.current?.calm
					? SEEK_CALM_STRIDE_S
					: SEEK_ACTIVE_STRIDE_S;
			}
			if (doneInfoRef.current) setTelemetry(doneInfoRef.current.telemetry);
			await finalize(vod.duration);
		} catch (e) {
			if (!abort.aborted) {
				abortScanRef.current?.();
				setError(String(e));
				setStatus("error");
			}
		}
	};

	const openStored = async (vod: VodSummary) => {
		const name = vod.name;
		abortRef.current.aborted = true;
		abortScanRef.current?.();
		setTelemetry(null);
		try {
			const events = await loadVodEvents(name);
			// VoDs saved before objective reads were mode-gated may carry them
			const loaded = withoutInvalidObjectives(
				events.map((e) => ({
					event: {
						type: e.type,
						t: e.t,
						confidence: e.confidence,
						data: e.data as FixtureData,
					},
					key: nextMatchKeyRef.current++,
					thumbnail: e.thumbnail,
					frameId: e.hasFrame ? e.id : undefined,
				})),
			);
			matchesRef.current = loaded;
			setMatches(loaded);
			setResultsSend(
				vod.resultsSend ? { state: "done", ...vod.resultsSend } : null,
			);
			setEventsOpen(false);
			setFileName(name);
			setSource("stored");
			setStatus("done");
			setError(null);
			setProgress(null);
			setGateScore(null);
			setMethod(null);
		} catch (e) {
			setError(String(e));
		}
	};

	const removeVod = async (name: string) => {
		await deleteVod(name);
		await refreshVods();
	};

	const backToList = () => {
		abortRef.current.aborted = true;
		abortScanRef.current?.();
		setTelemetry(null);
		matchesRef.current = [];
		setMatches([]);
		setResultsSend(null);
		setEventsOpen(false);
		setFileName(null);
		setStatus("idle");
		setError(null);
		setProgress(null);
		setGateScore(null);
		setMethod(null);
		void refreshVods();
	};

	const showVodView = fileName !== null;

	return (
		<div>
			<ScannerDropzone onFile={(file) => void scan(file)}>
				Drop a VoD (video file) here, or{" "}
				<label>
					pick a file
					<input
						type="file"
						accept="video/*"
						style={{ display: "none" }}
						onChange={(e) => {
							const file = e.target.files?.[0];
							e.target.value = ""; // allow re-picking the same file
							if (file) void scan(file);
						}}
					/>
				</label>
			</ScannerDropzone>
			<ScannerControls>
				{showVodView ? (
					<>
						<button type="button" onClick={backToList}>
							← All VoDs
						</button>
						<ScannerStatusPill
							variant={
								status === "scanning"
									? "watching"
									: status === "done"
										? "detected"
										: "idle"
							}
						>
							{source === "stored" ? "saved" : status}
							{fileName ? ` · ${fileName}` : null}
							{method ? ` · ${method}` : null}
							{gateScore !== null && status === "scanning"
								? ` · gate ${gateScore.toFixed(2)}`
								: null}
						</ScannerStatusPill>
						{progress ? (
							<span className="text-xxs text-lighter">
								{formatTime(progress.t)} / {formatTime(progress.duration)}
								{progress.duration > 0
									? ` (${Math.round((progress.t / progress.duration) * 100)}%)`
									: null}
								{progress.rate > 0
									? ` · ${progress.rate.toFixed(0)}× realtime`
									: null}
							</span>
						) : null}
						{upload?.url ? (
							<Link to={upload.url} className={styles.linkButton}>
								<Video aria-hidden />
								Add VoD
							</Link>
						) : null}
						{upload?.problem ? (
							<span className="text-xxs text-lighter">
								upload unavailable: {upload.problem}
							</span>
						) : null}
						{resultsMatchCount > 0 ? (
							<button
								type="button"
								disabled={!sendouUser || resultsSend?.state === "sending"}
								title={sendouUser ? undefined : "Log in on sendou.ink first"}
								onClick={() => void uploadResults()}
							>
								<Send aria-hidden />
								Send results
							</button>
						) : null}
						{resultsSend ? (
							<span
								className={clsx("text-xxs text-lighter", {
									"text-error":
										resultsSend.state === "done" && Boolean(resultsSend.error),
								})}
							>
								{resultsSend.state === "sending"
									? `sending match ${Math.min(resultsSend.sent + 1, resultsSend.total)}/${resultsSend.total}…`
									: resultsSend.error
										? `sent ${resultsSend.sent}/${resultsSend.total} matches — ${resultsSend.error}`
										: `sent ${resultsSend.sent}/${resultsSend.total} matches to sendou.ink`}
							</span>
						) : null}
						{matches.length > 0 ? (
							<ExportMenu
								fileName={fileName}
								events={matches.map((m) => m.event)}
							/>
						) : null}
					</>
				) : null}
			</ScannerControls>
			{error ? <p className="text-error">{error}</p> : null}
			{showVodView && telemetry ? (
				<TelemetryPanel telemetry={telemetry} />
			) : null}
			{!showVodView ? (
				<div className={styles.vodList}>
					{vods.length === 0 ? (
						<p className="text-xxs text-lighter">
							No saved VoDs yet — scan one and it will show up here.
						</p>
					) : null}
					{vods.map((vod) => (
						<div key={vod.name} className={styles.vodItem}>
							<span className={styles.vodName}>{vod.name}</span>
							<span className={clsx("text-xxs text-lighter", styles.vodMeta)}>
								{vod.eventCount} event{vod.eventCount === 1 ? "" : "s"} ·{" "}
								{formatTime(vod.duration)} · {formatSavedAt(vod.savedAt)}
							</span>
							<button type="button" onClick={() => void openStored(vod)}>
								Open
							</button>
							<FormWithConfirm
								dialogHeading={`Delete saved analysis of "${vod.name}"?`}
								onConfirm={() => void removeVod(vod.name)}
							>
								<SendouButton
									variant="destructive"
									size="small"
									shape="square"
									className={styles.vodDelete}
									icon={<Trash2 />}
									aria-label="Delete"
								/>
							</FormWithConfirm>
						</div>
					))}
				</div>
			) : null}
			<ScannerSplitLayout
				style={{
					display: showVodView ? undefined : "none",
					// a reopened saved VoD has no video to review — give the feed the full width
					gridTemplateColumns: source === "stored" ? "1fr" : undefined,
				}}
			>
				<div style={{ display: source === "scan" ? undefined : "none" }}>
					<canvas
						ref={previewRef}
						className={styles.preview}
						style={{ display: status === "scanning" ? "block" : "none" }}
					/>
					<video
						ref={videoRef}
						className={styles.preview}
						muted
						playsInline
						controls
						style={{
							display: fileName && status !== "scanning" ? "block" : "none",
						}}
					/>
				</div>
				<ScannerFeed>
					{matches.length === 0 ? (
						<p className="text-xxs text-lighter">
							{status === "scanning"
								? "Scanning — matches appear here as scoreboards are detected."
								: "No matches found in this VoD."}
						</p>
					) : null}
					<MatchLobbyTabs
						matches={builtMatches}
						keyOf={(built) => vodMatchByEvent.get(built.sources[0]!)!.key}
						renderMatch={(built, justFormed) => {
							const skipReason = skipReasons.get(built);
							const link = linkByIngestableIndex.get(
								ingestableBuilt.indexOf(built),
							);
							const send = skipReason ? undefined : bulkSend;
							// counter reads render as one timeline chart, not a card each, from the
							// builder's samples, whose sides are team-stable (raw reads follow the
							// specced player on casts); a non-SZ match's reads (objective null) are hidden
							const objectiveEvents = (
								built.match.objective?.samples ?? []
							).map((sample) => ({ t: sample.t, data: sample }));
							const statusSamples = built.match.playerStatus?.samples ?? [];
							const cardEvents = withoutRepeatEvents(built.sources).filter(
								(e) =>
									e.type !== OBJECTIVE_EVENT_TYPE &&
									e.type !== PLAYER_STATUS_EVENT_TYPE &&
									e.type !== STRIP_WEAPONS_EVENT_TYPE,
							);
							return (
								<MatchCard
									match={built.match}
									inProgress={
										status === "scanning" &&
										built === builtMatches.at(-1) &&
										built.match.winner === null
									}
									skipReason={skipReason}
									justFormed={justFormed}
									send={
										send?.state === "sent" && link ? { ...send, link } : send
									}
								>
									<GameTimeline
										objectiveEvents={objectiveEvents}
										playerStatusSamples={statusSamples}
										teams={playerStatusTeams(built.match, SCANNER_TEAM_LABELS)}
									/>
									{cardEvents.map((e) => {
										const vodMatch = vodMatchByEvent.get(e);
										return (
											<EventCard
												key={vodMatch?.key ?? `${e.type}-${e.t}`}
												type={e.type}
												t={e.t}
												confidence={e.confidence}
												data={e.data}
												abilities={abilityMap.get(e)}
												thumbnail={vodMatch?.thumbnail}
												getFrame={vodMatch ? frameLoader(vodMatch) : undefined}
											/>
										);
									})}
								</MatchCard>
							);
						}}
					/>
					{ungroupedMatches.length > 0 ? (
						<EventsSummary
							events={ungroupedMatches.map((m) => m.event)}
							open={eventsOpen}
							onToggle={() => setEventsOpen(!eventsOpen)}
						/>
					) : null}
					{/* newest detection on top; storage keeps ascending video-time order */}
					{eventsOpen
						? ungroupedMatches
								.toReversed()
								.map((m) => (
									<EventCard
										key={m.key}
										type={m.event.type}
										t={m.event.t}
										confidence={m.event.confidence}
										data={m.event.data}
										abilities={abilityMap.get(m.event)}
										thumbnail={m.thumbnail}
										getFrame={frameLoader(m)}
									/>
								))
						: null}
				</ScannerFeed>
			</ScannerSplitLayout>
		</div>
	);
}

/** Export formats of the scanned events, behind one icon-only menu. */
function ExportMenu({
	fileName,
	events,
}: {
	fileName: string;
	events: DetectedEvent<FixtureData>[];
}) {
	return (
		<SendouMenu
			trigger={<ScannerMenuButton icon={<Download />} label="Export" />}
		>
			<SendouMenuItem
				icon={<FileText />}
				onAction={() =>
					downloadEventsCsv(
						`${fileName.replace(/\.[^.]+$/, "")}-events.csv`,
						events,
					)
				}
			>
				CSV
			</SendouMenuItem>
		</SendouMenu>
	);
}

/** Drops objective reads that grouped into a known non-SZ match (misreads). */
function withoutInvalidObjectives(matches: VodMatch[]): VodMatch[] {
	const invalid = new Set(
		invalidObjectiveEvents(buildScannerMatches(matches.map((m) => m.event))),
	);
	return invalid.size > 0
		? matches.filter((m) => !invalid.has(m.event))
		: matches;
}

function frameLoader(m: VodMatch): GetFrame | undefined {
	return m.frame
		? () => Promise.resolve(m.frame)
		: m.frameId !== undefined
			? () => loadVodEventFrame(m.frameId!)
			: undefined;
}

function TelemetryPanel({ telemetry }: { telemetry: ScanTelemetry }) {
	const detectors = Object.entries(telemetry.detectors).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	const coveredS = telemetry.activeVideoS + telemetry.skimVideoS;
	return (
		<details className={styles.telemetry}>
			<summary>
				telemetry · analyzed {telemetry.analyzedFrames}/
				{telemetry.decodedFrames} decoded frames
				{coveredS > 0
					? ` · skimmed ${formatTime(telemetry.skimVideoS)} of ${formatTime(coveredS)}`
					: null}
				{telemetry.wallMs > 0
					? ` · ${formatTime(telemetry.wallMs / 1000)} cpu`
					: null}
			</summary>
			<table>
				<thead>
					<tr>
						<th>detector</th>
						<th>checks</th>
						<th>gate pass</th>
						<th>gate ms</th>
						<th>parses</th>
						<th>parse ms</th>
						<th>suppressed</th>
					</tr>
				</thead>
				<tbody>
					{detectors.map(([id, d]) => (
						<tr key={id}>
							<td>{id}</td>
							<td>{d.checks}</td>
							<td>{d.gatePasses}</td>
							<td>{Math.round(d.gateMs)}</td>
							<td>{d.parses}</td>
							<td>{Math.round(d.parseMs)}</td>
							<td>{d.suppressedParses}</td>
						</tr>
					))}
				</tbody>
			</table>
		</details>
	);
}

function drawPreview(
	canvas: HTMLCanvasElement | null,
	frame: ImageBitmap | VideoFrame,
): void {
	if (!canvas) return;
	const width = "displayWidth" in frame ? frame.displayWidth : frame.width;
	const height = "displayHeight" in frame ? frame.displayHeight : frame.height;
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
	}
	canvas.getContext("2d")!.drawImage(frame, 0, 0);
}
