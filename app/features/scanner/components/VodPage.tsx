/**
 * VoD tab: load a video file and scan it for scoreboard matches as fast as
 * decoding allows — no real-time playback (see src/capture/vod-frames.ts).
 * Every frame is decoded and handed to a pool of analyzer workers; decode
 * never waits on analysis (a frame arriving while all workers are busy is
 * dropped — the next is ~1/60s away), so the scan runs at decode speed and
 * analysis coverage stays as dense as the machine keeps up with — dense
 * enough that even overlays visible for a fraction of a second are seen.
 * Each match can be opened in the screenshot page with the exact frame
 * that was analyzed.
 *
 * Completed scans are persisted to IndexedDB keyed by file name
 * (src/store/vods.ts); the default view lists them for reinspection.
 */
import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Link } from "react-router";
import { openVodScan } from "../capture/vod-frames";
import { connectAbilities } from "../core/ability-harvest";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "../core/detectors/objective/index";
import type { DetectedEvent } from "../core/detectors/types";
import { buildScannerMatches, isIngestableMatch } from "../core/match-builder";
import { assignMatchSets } from "../core/match-sets";
import { TimelineBuilder } from "../core/timeline/index";
import type { SendStatus } from "../store/events";
import {
	deleteVod,
	listVods,
	loadVodEventFrame,
	loadVodEvents,
	saveVod,
	type VodSummary,
} from "../store/vods";
import { AnalyzerPool, defaultPoolSize } from "../worker/pool";
import { withoutRepeatEvents } from "./dedupe-events";
import { EventCard, type GetFrame } from "./EventCard";
import { EventsSummary } from "./EventsSummary";
import { downloadEventsCsv } from "./events-csv";
import type { FixtureData } from "./fixture-export";
import { SENDOU_UPLOAD_ENABLED } from "./flags";
import { formatTime } from "./format";
import { MatchCard, SetDivider } from "./MatchCard";
import { ObjectiveTimeline } from "./ObjectiveTimeline";
import {
	countIngestableMatches,
	type SendouUser,
	sendVodResults,
} from "./sendou-ingest";
import { sendouUpload } from "./sendou-upload";
import { thumbnailFromBlob } from "./thumbnail";

/**
 * Hard coverage floor: at most this much video may pass between two analyzed
 * frames. Busy-dropping alone is not enough — around match results every
 * gate fires and each analyzed frame runs a full parse (+ PNG encode), so
 * the whole pool can stay busy for hundreds of ms while decode races ahead
 * whole seconds of video; short screens (the own-results screen shows ~3s)
 * then fall into the gap. When the budget is spent and no worker is free,
 * decode waits.
 */
const MAX_ANALYSIS_GAP_SECONDS = 0.25;

type Status = "idle" | "scanning" | "done" | "error";

interface VodMatch {
	event: DetectedEvent<FixtureData>;
	/**
	 * render identity — inherited when a better read replaces the event, so
	 * match cards keyed on it don't remount (replaying the enter animation)
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

/** "Upload as results" progress/outcome shown next to the button. */
type ResultsSend =
	| { state: "sending"; sent: number; total: number }
	| {
			state: "done";
			sent: number;
			total: number;
			error: string | null;
			at: number;
	  };

export function VodPage({
	sendouUser,
}: {
	/** sendou.ink login shown in the header; undefined = probing, null = not logged in */
	sendouUser: SendouUser | null | undefined;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const previewRef = useRef<HTMLCanvasElement>(null);
	const poolRef = useRef<AnalyzerPool | null>(null);
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
	const [over, setOver] = useState(false);
	const [eventsOpen, setEventsOpen] = useState(false);
	const [resultsSend, setResultsSend] = useState<ResultsSend | null>(null);

	const abilityMap = useMemo(
		() => connectAbilities(matches.map((m) => m.event)),
		[matches],
	);

	const builtMatches = buildScannerMatches(matches.map((m) => m.event));
	const setNumbers = assignMatchSets(builtMatches.map((b) => b.match));
	const showSetDividers = (setNumbers.at(-1) ?? 1) > 1;
	const vodMatchByEvent = new Map(matches.map((m) => [m.event, m] as const));
	const groupedEvents = new Set(builtMatches.flatMap((b) => b.sources));
	const ungroupedMatches = matches.filter((m) => !groupedEvents.has(m.event));

	// "Upload as results" sends the whole scan in one go, so its outcome maps
	// onto every ingestable card; a partial failure (some chunks sent, some
	// not) can't be attributed per match — the bulk status text covers it
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
	const upload = useMemo(
		() =>
			status === "done" ? sendouUpload(matches.map((m) => m.event)) : null,
		[status, matches],
	);

	// "Upload as results" — the /ingest counterpart of live sending: the
	// scan's ingestable ScannerMatches POSTed in one go
	const resultsMatchCount = useMemo(
		() =>
			status === "done"
				? countIngestableMatches(matches.map((m) => m.event))
				: 0,
		[status, matches],
	);

	const uploadResults = useCallback(async () => {
		const events = matchesRef.current.map((m) => m.event);
		setResultsSend({
			state: "sending",
			sent: 0,
			total: countIngestableMatches(events),
		});
		const report = await sendVodResults(events, (sent, total) =>
			setResultsSend({ state: "sending", sent, total }),
		);
		setResultsSend({
			state: "done",
			sent: report.sentMatches,
			total: report.totalMatches,
			error: report.error,
			at: Date.now(),
		});
	}, []);

	const refreshVods = useCallback(async () => {
		try {
			setVods(await listVods());
		} catch {
			// listing failures are non-fatal; the scan UI still works
		}
	}, []);

	useEffect(() => {
		void refreshVods();
		return () => {
			abortRef.current.aborted = true;
			poolRef.current?.dispose();
			if (urlRef.current) URL.revokeObjectURL(urlRef.current);
		};
	}, [refreshVods]);

	const scan = useCallback(
		async (file: File) => {
			abortRef.current.aborted = true;
			const abort = { aborted: false };
			abortRef.current = abort;

			setError(null);
			setMatches([]);
			setResultsSend(null);
			setEventsOpen(false);
			setProgress(null);
			setGateScore(null);
			setMethod(null);
			setFileName(file.name);
			setSource("scan");
			setStatus("scanning");

			let dispose = () => {};
			try {
				// the element is used by the seek fallback and for post-scan review
				const video = videoRef.current!;
				if (urlRef.current) URL.revokeObjectURL(urlRef.current);
				urlRef.current = URL.createObjectURL(file);
				video.src = urlRef.current;

				poolRef.current ??= new AnalyzerPool(
					defaultPoolSize(),
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
									const next = matchesRef.current.filter((m) => m !== replaced);
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
						setError(message);
						setStatus("error");
					},
				);
				const pool = poolRef.current;
				await pool.whenReady();
				// let frames still in flight from an aborted scan finish before the
				// timeline resets, so their results can't bleed into this scan
				await pool.whenIdle();
				if (abort.aborted) return;
				matchesRef.current = [];
				sideWorkRef.current = [];
				timelineRef.current = new TimelineBuilder();

				const vod = await openVodScan(file, video);
				dispose = () => vod.dispose();
				if (abort.aborted) return;
				setMethod(vod.method);

				const started = performance.now();
				// each frame goes to an idle worker; with none free it is dropped
				// unless MAX_ANALYSIS_GAP_SECONDS of video has passed unanalyzed,
				// in which case decode waits for a worker. Preview/progress
				// re-renders are throttled off the hot loop (the preview draw must
				// precede tryAnalyze — transferring the frame to a worker detaches it).
				let lastUiUpdate = Number.NEGATIVE_INFINITY;
				let lastAnalyzedT = Number.NEGATIVE_INFINITY;
				for await (const { frame, t } of vod.frames) {
					if (abort.aborted) {
						frame.close();
						break;
					}
					const now = performance.now();
					if (now - lastUiUpdate >= 250) {
						lastUiUpdate = now;
						drawPreview(previewRef.current, frame);
						setGateScore(gateScoreRef.current);
						const elapsed = (now - started) / 1000;
						setProgress({
							t,
							duration: vod.duration,
							rate: elapsed > 0 ? t / elapsed : 0,
						});
					}
					if (!pool.hasIdle()) {
						if (t - lastAnalyzedT < MAX_ANALYSIS_GAP_SECONDS) {
							frame.close();
							continue;
						}
						await pool.whenAnyIdle();
						if (abort.aborted) {
							frame.close();
							break;
						}
					}
					pool.tryAnalyze(frame, t);
					lastAnalyzedT = t;
				}
				await pool.whenIdle();
				await Promise.all(sideWorkRef.current);
				if (!abort.aborted) {
					setProgress((p) => (p ? { ...p, t: vod.duration } : p));
					setStatus("done");
					await saveVod(
						{ name: file.name, savedAt: Date.now(), duration: vod.duration },
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
				}
			} catch (e) {
				if (!abort.aborted) {
					setError(String(e));
					setStatus("error");
				}
			} finally {
				dispose();
			}
		},
		[refreshVods],
	);

	const openStored = useCallback(async (name: string) => {
		abortRef.current.aborted = true;
		try {
			const events = await loadVodEvents(name);
			const loaded: VodMatch[] = events.map((e) => ({
				event: {
					type: e.type,
					t: e.t,
					confidence: e.confidence,
					data: e.data as FixtureData,
				},
				key: nextMatchKeyRef.current++,
				thumbnail: e.thumbnail,
				frameId: e.hasFrame ? e.id : undefined,
			}));
			matchesRef.current = loaded;
			setMatches(loaded);
			setResultsSend(null);
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
	}, []);

	const removeVod = useCallback(
		async (name: string) => {
			if (!window.confirm(`Delete saved analysis of "${name}"?`)) return;
			await deleteVod(name);
			await refreshVods();
		},
		[refreshVods],
	);

	const backToList = useCallback(() => {
		abortRef.current.aborted = true;
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
	}, [refreshVods]);

	const showVodView = fileName !== null;

	return (
		<div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target; the file input inside is the accessible path */}
			<div
				className={`dropzone ${over ? "over" : ""}`}
				onDragOver={(e) => {
					e.preventDefault();
					setOver(true);
				}}
				onDragLeave={() => setOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setOver(false);
					const file = e.dataTransfer.files[0];
					if (file) void scan(file);
				}}
			>
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
			</div>
			<div className="controls">
				{showVodView && (
					<>
						<button type="button" onClick={backToList}>
							← All VoDs
						</button>
						<span
							className={`status ${status === "scanning" ? "watching" : status === "done" ? "detected" : "idle"}`}
						>
							{source === "stored" ? "saved" : status}
							{fileName && ` · ${fileName}`}
							{method && ` · ${method}`}
							{gateScore !== null &&
								status === "scanning" &&
								` · gate ${gateScore.toFixed(2)}`}
						</span>
						{progress && (
							<span className="score">
								{formatTime(progress.t)} / {formatTime(progress.duration)}
								{progress.duration > 0 &&
									` (${Math.round((progress.t / progress.duration) * 100)}%)`}
								{progress.rate > 0 &&
									` · ${progress.rate.toFixed(0)}× realtime`}
							</span>
						)}
						{builtMatches.length > 0 && (
							<span className="score">
								{builtMatches.length} match
								{builtMatches.length === 1 ? "" : "es"}
							</span>
						)}
						{matches.length > 0 && (
							<button
								type="button"
								onClick={() =>
									downloadEventsCsv(
										`${fileName.replace(/\.[^.]+$/, "")}-events.csv`,
										matches.map((m) => m.event),
									)
								}
							>
								Download CSV
							</button>
						)}
						{SENDOU_UPLOAD_ENABLED && upload?.url && (
							<Link to={upload.url} className="link-button">
								Upload as VoD
							</Link>
						)}
						{SENDOU_UPLOAD_ENABLED && upload?.problem && (
							<span className="score">
								upload unavailable: {upload.problem}
							</span>
						)}
						{SENDOU_UPLOAD_ENABLED && resultsMatchCount > 0 && (
							<button
								type="button"
								disabled={!sendouUser || resultsSend?.state === "sending"}
								title={sendouUser ? undefined : "log in on sendou.ink first"}
								onClick={() => void uploadResults()}
							>
								Upload as results
							</button>
						)}
						{resultsSend && (
							<span
								className={`score ${resultsSend.state === "done" && resultsSend.error ? "error" : ""}`}
							>
								{resultsSend.state === "sending"
									? `sending match ${Math.min(resultsSend.sent + 1, resultsSend.total)}/${resultsSend.total}…`
									: resultsSend.error
										? `sent ${resultsSend.sent}/${resultsSend.total} matches — ${resultsSend.error}`
										: `sent ${resultsSend.sent}/${resultsSend.total} matches to sendou.ink`}
							</span>
						)}
					</>
				)}
			</div>
			{error && <p className="error">{error}</p>}
			{!showVodView && (
				<div className="vod-list">
					{vods.length === 0 && (
						<p className="score">
							No saved VoDs yet — scan one and it will show up here.
						</p>
					)}
					{vods.map((vod) => (
						<div key={vod.name} className="vod-item">
							<span className="name">{vod.name}</span>
							<span className="score">
								{vod.eventCount} event{vod.eventCount === 1 ? "" : "s"} ·{" "}
								{formatTime(vod.duration)} ·{" "}
								{new Date(vod.savedAt).toLocaleString()}
							</span>
							<button type="button" onClick={() => void openStored(vod.name)}>
								Open
							</button>
							<button type="button" onClick={() => void removeVod(vod.name)}>
								Delete
							</button>
						</div>
					))}
				</div>
			)}
			<div
				className="live-layout"
				style={{
					display: showVodView ? undefined : "none",
					// a reopened saved VoD has no video to review — give the feed the full width
					gridTemplateColumns: source === "stored" ? "1fr" : undefined,
				}}
			>
				<div style={{ display: source === "scan" ? undefined : "none" }}>
					<canvas
						ref={previewRef}
						className="preview"
						style={{ display: status === "scanning" ? "block" : "none" }}
					/>
					<video
						ref={videoRef}
						className="preview"
						muted
						playsInline
						controls
						style={{
							display: fileName && status !== "scanning" ? "block" : "none",
						}}
					/>
				</div>
				<div className="feed">
					{matches.length === 0 ? (
						<p className="score">
							{status === "scanning"
								? "Scanning — matches appear here as scoreboards are detected."
								: "No matches found in this VoD."}
						</p>
					) : null}
					{/* newest match on top; the builder keeps ascending video-time order */}
					{[...builtMatches].reverse().map((built, reverseIndex) => {
						const index = builtMatches.length - 1 - reverseIndex;
						const ingestable = isIngestableMatch(built.match);
						// counter reads render as one timeline chart, not a card each
						const objectiveEvents = built.sources
							.filter((e) => e.type === OBJECTIVE_EVENT_TYPE)
							.map((e) => ({ t: e.t, data: e.data as ObjectiveData }));
						const cardEvents = withoutRepeatEvents(built.sources).filter(
							(e) => e.type !== OBJECTIVE_EVENT_TYPE,
						);
						return (
							<Fragment key={vodMatchByEvent.get(built.sources[0]!)!.key}>
								{showSetDividers &&
								setNumbers[index + 1] !== setNumbers[index] ? (
									<SetDivider number={setNumbers[index]!} />
								) : null}
								<MatchCard
									match={built.match}
									inProgress={
										status === "scanning" &&
										reverseIndex === 0 &&
										built.match.winner === null
									}
									ingestable={ingestable}
									send={ingestable ? bulkSend : undefined}
								>
									{objectiveEvents.length > 0 ? (
										<ObjectiveTimeline events={objectiveEvents} />
									) : null}
									{cardEvents.map((e, i) => {
										const vodMatch = vodMatchByEvent.get(e);
										return (
											<EventCard
												key={i}
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
							</Fragment>
						);
					})}
					{ungroupedMatches.length > 0 ? (
						<EventsSummary
							events={ungroupedMatches.map((m) => m.event)}
							open={eventsOpen}
							onToggle={() => setEventsOpen(!eventsOpen)}
						/>
					) : null}
					{/* newest detection on top; storage keeps ascending video-time order */}
					{eventsOpen
						? [...ungroupedMatches]
								.reverse()
								.map((m, i) => (
									<EventCard
										key={ungroupedMatches.length - 1 - i}
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
				</div>
			</div>
		</div>
	);
}

function frameLoader(m: VodMatch): GetFrame | undefined {
	return m.frame
		? () => Promise.resolve(m.frame)
		: m.frameId !== undefined
			? () => loadVodEventFrame(m.frameId!)
			: undefined;
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
