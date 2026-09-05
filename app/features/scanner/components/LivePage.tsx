import { Camera, Ellipsis, FileText, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SendouMenu, SendouMenuItem } from "~/components/elements/Menu";
import { GameTimeline } from "~/components/GameTimeline";
import {
	listVideoInputs,
	openVirtualCamera,
	startSampler,
} from "../capture/sampler";
import { connectAbilities } from "../core/ability-harvest";
import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "../core/detectors/minimap/index";
import { OBJECTIVE_EVENT_TYPE } from "../core/detectors/objective/index";
import { PLAYER_STATUS_EVENT_TYPE } from "../core/detectors/objective/player-status";
import { STRIP_WEAPONS_EVENT_TYPE } from "../core/detectors/objective/strip-weapons";
import { SCOREBOARD_EVENT_TYPES } from "../core/detectors/registry";
import type { DetectedEvent, GateResult } from "../core/detectors/types";
import type { BuiltMatch } from "../core/match-builder";
import {
	buildScannerMatches,
	ingestSkipReasons,
	invalidObjectiveEvents,
} from "../core/match-builder";
import { TimelineBuilder } from "../core/timeline/index";
import {
	clearEvents,
	deleteEvents,
	listEvents,
	loadEventFrame,
	type StoredEvent,
	saveEvent,
	updateEventsSend,
} from "../store/events";
import { AnalyzerClient } from "../worker/client";
import { withoutRepeatEvents } from "./dedupe-events";
import { EventCard } from "./EventCard";
import { EventsSummary } from "./EventsSummary";
import { downloadEventsCsv } from "./events-csv";
import { type FixtureData, saveFixture } from "./fixture-export";
import styles from "./LivePage.module.css";
import { MatchCard } from "./MatchCard";
import { MatchLobbyTabs } from "./MatchLobbyTabs";
import { playerStatusTeams } from "./player-status-view";
import {
	ScannerControls,
	ScannerFeed,
	ScannerMenuButton,
	ScannerSplitLayout,
	ScannerStatusPill,
} from "./ScannerChrome";
import {
	aggregateSendStatus,
	matchContaining,
	retryableUnlinkedMatches,
	type SendouUser,
	sendMatches,
	unsentMatches,
} from "./sendou-ingest";
import { thumbnailFromBlob } from "./thumbnail";

const SAMPLE_FPS = 2;

/**
 * A slow parse (a browsed battle-log entry, a CJK splash-tag name) can occupy
 * the worker for seconds to tens of seconds; buffering the frames sampled
 * meanwhile keeps the stall from being missed. 24 frames hold ~12s at full
 * density; past that the backlog is decimated toward even spacing over the
 * stall (worker/frame-queue.ts) so a results screen mid-stall survives.
 */
const FRAME_QUEUE_LIMIT = 24;

/** How often a running capture rechecks unlinked matches for a retry (backoff in sendou-ingest.ts). */
const UNLINKED_RETRY_TICK_MS = 15_000;

/** The scan knows the on-screen sides only, not who is playing. */
const SCANNER_TEAM_LABELS = ["Alpha", "Bravo"] as const;

/** Event types the ingested matches are built from — the only ones with a send status. */
const INGESTABLE_TYPES = [
	MAP_START_EVENT_TYPE,
	DEATH_EVENT_TYPE,
	MINIMAP_EVENT_TYPE,
	...SCOREBOARD_EVENT_TYPES,
];

type Status = "idle" | "loading" | "watching" | "detected" | "error";

export function LivePage({
	sendouUser,
}: {
	/** sendou.ink login shown in the header; undefined = probing, null = not logged in */
	sendouUser: SendouUser | null | undefined;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const clientRef = useRef<AnalyzerClient | null>(null);
	const timelineRef = useRef(new TimelineBuilder());
	const storedIdsRef = useRef(new WeakMap<DetectedEvent, number>());
	const latestParseRef = useRef<{ type: string; data: FixtureData } | null>(
		null,
	);
	const gatesRef = useRef(new Map<string, GateResult>());
	const stopRef = useRef<(() => void) | null>(null);
	const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	// the open match is known to be a non-SZ mode, so counter reads are
	// misreads of another mode's overlay and are not collected at all
	const objectiveBlockedRef = useRef(false);

	const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
	const [deviceId, setDeviceId] = useState<string>("");
	const [status, setStatus] = useState<Status>("idle");
	const [gateScore, setGateScore] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [feed, setFeed] = useState<StoredEvent[]>([]);
	const [running, setRunning] = useState(false);
	const [sendouError, setSendouError] = useState<string | null>(null);
	const [eventsOpen, setEventsOpen] = useState(false);
	const [liveSend, setLiveSend] = useState(false);
	const liveSendRef = useRef(false);
	const sendingRef = useRef(false);
	const pendingSendsRef = useRef<
		Array<(built: BuiltMatch<StoredEvent>) => boolean>
	>([]);

	// every saved event asks for a refresh, ~2-3 a second during a match; requests
	// landing while one runs coalesce into a single trailing pass
	const refreshStateRef = useRef({ running: false, queued: false });
	const refreshFeed = useCallback(() => {
		const state = refreshStateRef.current;
		if (state.running) {
			state.queued = true;
			return;
		}
		state.running = true;
		void (async () => {
			try {
				do {
					state.queued = false;
					const events = await listEvents();
					// objective reads grouped into a known non-SZ match slipped past the live
					// block (e.g. the mode read arrived after them) — delete them
					const invalid = new Set(
						invalidObjectiveEvents(buildScannerMatches(events)),
					);
					if (invalid.size > 0) {
						await deleteEvents(
							[...invalid]
								.map((event) => event.id)
								.filter((id): id is number => id !== undefined),
						);
					}
					setFeed(
						events
							.filter((event) => !invalid.has(event))
							.sort(
								(a, b) =>
									b.detectedAt - a.detectedAt || (b.id ?? 0) - (a.id ?? 0),
							),
					);
				} while (state.queued);
			} finally {
				state.running = false;
			}
		})();
	}, []);

	useEffect(() => {
		refreshFeed();
		return () => {
			stopRef.current?.();
			if (retryTimerRef.current) clearInterval(retryTimerRef.current);
			clientRef.current?.dispose();
		};
	}, [refreshFeed]);

	/** Sends the matches `include` selects; serialized so sends never overlap (a send requested mid-flight runs right after). */
	const send = async (
		include: (built: BuiltMatch<StoredEvent>) => boolean,
		{ manual = false } = {},
	) => {
		if (sendingRef.current) {
			pendingSendsRef.current.push(include);
			return;
		}
		sendingRef.current = true;
		if (manual) setSendouError(null);
		try {
			let next: typeof include | undefined = include;
			let firstPass = true;
			while (next) {
				const events = await listEvents();
				const { sentMatches, failedMatches } = await sendMatches({
					events,
					include: next,
					onStatus: refreshFeed,
				});
				if (manual && firstPass && sentMatches + failedMatches === 0) {
					setSendouError("nothing to send — no complete match selected");
				}
				firstPass = false;
				const pending = pendingSendsRef.current;
				pendingSendsRef.current = [];
				next =
					pending.length > 0
						? (built) => pending.some((fn) => fn(built))
						: undefined;
			}
		} finally {
			sendingRef.current = false;
			refreshFeed();
		}
	};

	/** `withLiveSend`: send each match to sendou.ink as it closes. */
	const start = async (withLiveSend: boolean) => {
		setError(null);
		setSendouError(null);
		setStatus("loading");
		liveSendRef.current = withLiveSend;
		setLiveSend(withLiveSend);
		// a restart may land mid-another-match; collect until its mode is known
		objectiveBlockedRef.current = false;
		try {
			const video = videoRef.current!;
			const stream = await openVirtualCamera(deviceId || undefined);
			video.srcObject = stream;
			await video.play();
			setDevices(await listVideoInputs());

			clientRef.current ??= new AnalyzerClient(
				(result) => {
					// one result arrives per detector per frame; status reflects
					// whether any of them fired
					gatesRef.current.set(result.detector, result.gate);
					const gates = [...gatesRef.current.values()];
					setGateScore(Math.max(...gates.map((g) => g.score)));
					if (!result.gate.pass) {
						if (!gates.some((g) => g.pass)) setStatus("watching");
						return;
					}
					setStatus("detected");
					for (const event of result.events as DetectedEvent<FixtureData>[]) {
						latestParseRef.current = { type: event.type, data: event.data };
						if (
							(event.type === OBJECTIVE_EVENT_TYPE ||
								event.type === PLAYER_STATUS_EVENT_TYPE) &&
							objectiveBlockedRef.current
						) {
							continue;
						}
						const action = timelineRef.current.push(event);
						if (action.action === "added" || action.action === "replaced") {
							if (event.type === MAP_START_EVENT_TYPE) {
								const mode = (event.data as MapStartData).mode;
								objectiveBlockedRef.current = mode !== null && mode !== "SZ";
							} else if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
								objectiveBlockedRef.current = false;
							}
							const stale =
								action.action === "replaced"
									? storedIdsRef.current.get(action.replaced)
									: undefined;
							void (async () => {
								const thumbnail = result.frame
									? await thumbnailFromBlob(result.frame)
									: undefined;
								// reusing the replaced event's id keeps match card keys
								// stable, so repeat detections don't remount the cards
								const id = await saveEvent(
									event,
									thumbnail,
									result.frame,
									stale,
								);
								storedIdsRef.current.set(event, id);
								if (
									liveSendRef.current &&
									INGESTABLE_TYPES.includes(event.type)
								) {
									if (SCOREBOARD_EVENT_TYPES.includes(event.type)) {
										// a scoreboard closes its match — send it
										refreshFeed();
										await send(
											(built) =>
												matchContaining(id)(built) && unsentMatches(built),
										);
									} else {
										await updateEventsSend([id], {
											state: "queued",
											at: Date.now(),
										});
									}
								}
								refreshFeed();
							})();
						}
					}
				},
				(message) => {
					setError(message);
					setStatus("error");
				},
				undefined,
				{ frameQueueLimit: FRAME_QUEUE_LIMIT },
			);
			await clientRef.current.whenReady();

			stopRef.current = startSampler(video, SAMPLE_FPS, (bitmap, t) => {
				clientRef.current?.analyze(bitmap, t);
			});
			// a match sent the moment its scoreboard closed usually beats the players to
			// reporting it, so sendou.ink had nothing to link to; retry those while the
			// capture runs, along with closed matches whose close-send was never attempted
			retryTimerRef.current ??= setInterval(() => {
				if (liveSendRef.current) {
					void send(
						(built) =>
							retryableUnlinkedMatches(built) || unsentClosedMatches(built),
					);
				}
			}, UNLINKED_RETRY_TICK_MS);
			setStatus("watching");
			setRunning(true);
		} catch (e) {
			setError(String(e));
			setStatus("error");
		}
	};

	const builtMatches = buildScannerMatches(feed);
	const skipReasons = ingestSkipReasons(builtMatches);
	const groupedEvents = new Set(builtMatches.flatMap((b) => b.sources));
	// strip weapon evidence is assignment input, not a detection worth a card
	const ungroupedFeed = feed.filter(
		(e) => !groupedEvents.has(e) && e.type !== STRIP_WEAPONS_EVENT_TYPE,
	);
	const abilityMap = connectAbilities(feed);

	const stop = () => {
		stopRef.current?.();
		stopRef.current = null;
		if (retryTimerRef.current) clearInterval(retryTimerRef.current);
		retryTimerRef.current = null;
		const video = videoRef.current;
		if (video?.srcObject instanceof MediaStream) {
			for (const track of video.srcObject.getTracks()) track.stop();
			video.srcObject = null;
		}
		setRunning(false);
		setStatus("idle");
		// the scan ending is the last match boundary — flush what's unsent
		// (partials are safe: the server merges them into fuller resends)
		if (liveSendRef.current) void send(unsentMatches);
		liveSendRef.current = false;
		setLiveSend(false);
	};

	return (
		<div>
			<ScannerControls>
				{!running ? (
					<>
						<button
							type="button"
							disabled={!sendouUser}
							title={sendouUser ? undefined : "Log in on sendou.ink first"}
							onClick={() => void start(true)}
						>
							<Send aria-hidden />
							Start capture
						</button>
						<button
							type="button"
							className={styles.outlined}
							onClick={() => void start(false)}
						>
							Start capture (no sending)
						</button>
					</>
				) : (
					<>
						<button type="button" onClick={stop}>
							Stop
						</button>
						<button
							type="button"
							className={styles.outlined}
							disabled={!sendouUser}
							title={sendouUser ? undefined : "Log in on sendou.ink first"}
							onClick={() => {
								liveSendRef.current = !liveSend;
								setLiveSend(!liveSend);
							}}
						>
							<Send aria-hidden />
							{liveSend ? "Stop sending" : "Start sending"}
						</button>
					</>
				)}
				<select
					className={styles.deviceSelect}
					value={deviceId}
					onChange={(e) => setDeviceId(e.target.value)}
				>
					<option value="">Default camera (OBS Virtual Camera)</option>
					{devices.map((d) => (
						<option key={d.deviceId} value={d.deviceId}>
							{d.label || d.deviceId.slice(0, 8)}
						</option>
					))}
				</select>
				<ScannerStatusPill
					variant={
						status === "detected"
							? "detected"
							: status === "watching"
								? "watching"
								: "idle"
					}
				>
					{status}
					{gateScore !== null ? ` · gate ${gateScore.toFixed(2)}` : null}
				</ScannerStatusPill>
				{liveSend ? (
					<ScannerStatusPill variant="watching">
						sending matches live
					</ScannerStatusPill>
				) : null}
				<LiveMenu
					canSaveFixture={running}
					canSend={Boolean(sendouUser) && feed.length > 0}
					hasEvents={feed.length > 0}
					onSaveFixture={() =>
						void saveFixture(videoRef.current!, latestParseRef.current)
					}
					onDownloadCsv={() =>
						downloadEventsCsv(
							`live-events-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`,
							// feed is newest-first for display; export in chronological order
							feed.toSorted(
								(a, b) =>
									a.detectedAt - b.detectedAt || (a.id ?? 0) - (b.id ?? 0),
							),
						)
					}
					onSendUnsent={() => void send(unsentMatches, { manual: true })}
					onClearFeed={() => {
						if (!window.confirm("Clear all detected events?")) return;
						void clearEvents().then(refreshFeed);
					}}
				/>
			</ScannerControls>
			{error ? <p className="text-error">{error}</p> : null}
			{sendouError ? <p className="text-error">{sendouError}</p> : null}
			<ScannerSplitLayout>
				<video ref={videoRef} className={styles.preview} muted playsInline />
				<ScannerFeed>
					{feed.length === 0 ? (
						<p className="text-xxs text-lighter">No detections yet.</p>
					) : null}
					<MatchLobbyTabs
						matches={builtMatches}
						keyOf={(built) => built.sources[0]!.id!}
						renderMatch={(built, justFormed) => {
							const id = built.sources[0]!.id!;
							const skipReason = skipReasons.get(built);
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
							const newest = built === builtMatches.at(-1);
							return (
								<MatchCard
									match={built.match}
									live={running && newest && built.match.winner === null}
									inProgress={newest && built.match.winner === null}
									skipReason={skipReason}
									justFormed={justFormed}
									send={aggregateSendStatus(built.sources)}
									onSend={
										sendouUser && !skipReason
											? () => void send(matchContaining(id), { manual: true })
											: undefined
									}
								>
									<GameTimeline
										objectiveEvents={objectiveEvents}
										playerStatusSamples={statusSamples}
										teams={playerStatusTeams(built.match, SCANNER_TEAM_LABELS)}
									/>
									{cardEvents.map((e) => (
										<EventCard
											key={e.id}
											type={e.type}
											t={e.t}
											confidence={e.confidence}
											data={e.data as FixtureData}
											abilities={abilityMap.get(e)}
											thumbnail={e.thumbnail}
											detectedAt={e.detectedAt}
											getFrame={
												e.hasFrame && e.id !== undefined
													? () => loadEventFrame(e.id!)
													: undefined
											}
										/>
									))}
								</MatchCard>
							);
						}}
					/>
					{ungroupedFeed.length > 0 ? (
						<EventsSummary
							events={ungroupedFeed}
							open={eventsOpen}
							onToggle={() => setEventsOpen(!eventsOpen)}
						/>
					) : null}
					{eventsOpen
						? ungroupedFeed.map((e) => (
								<EventCard
									key={e.id}
									type={e.type}
									t={e.t}
									confidence={e.confidence}
									data={e.data as FixtureData}
									abilities={abilityMap.get(e)}
									thumbnail={e.thumbnail}
									detectedAt={e.detectedAt}
									getFrame={
										e.hasFrame && e.id !== undefined
											? () => loadEventFrame(e.id!)
											: undefined
									}
									send={e.send}
									onSend={
										sendouUser &&
										e.id !== undefined &&
										INGESTABLE_TYPES.includes(e.type)
											? () =>
													void send(matchContaining(e.id!), { manual: true })
											: undefined
									}
								/>
							))
						: null}
				</ScannerFeed>
			</ScannerSplitLayout>
		</div>
	);
}

/** The capture's occasional actions, behind one icon-only menu. */
function LiveMenu({
	canSaveFixture,
	canSend,
	hasEvents,
	onSaveFixture,
	onDownloadCsv,
	onSendUnsent,
	onClearFeed,
}: {
	canSaveFixture: boolean;
	canSend: boolean;
	hasEvents: boolean;
	onSaveFixture: () => void;
	onDownloadCsv: () => void;
	onSendUnsent: () => void;
	onClearFeed: () => void;
}) {
	return (
		<SendouMenu
			trigger={<ScannerMenuButton icon={<Ellipsis />} label="More actions" />}
		>
			<SendouMenuItem
				icon={<Camera />}
				isDisabled={!canSaveFixture}
				onAction={onSaveFixture}
			>
				Save frame as fixture
			</SendouMenuItem>
			<SendouMenuItem
				icon={<FileText />}
				isDisabled={!hasEvents}
				onAction={onDownloadCsv}
			>
				CSV
			</SendouMenuItem>
			<SendouMenuItem
				icon={<Send />}
				isDisabled={!canSend}
				onAction={onSendUnsent}
			>
				Send unsent to sendou.ink
			</SendouMenuItem>
			<SendouMenuItem
				icon={<Trash2 />}
				isDestructive
				isDisabled={!hasEvents}
				onAction={onClearFeed}
			>
				Clear feed
			</SendouMenuItem>
		</SendouMenu>
	);
}

/**
 * A closed match whose send was never attempted: a match-close send can be
 * skipped (a page reload loses the queue), so the retry tick flushes these.
 * Sent/unlinked/failed matches follow their own paths.
 */
function unsentClosedMatches(built: BuiltMatch<StoredEvent>): boolean {
	return (
		built.sources.some((e) => SCOREBOARD_EVENT_TYPES.includes(e.type)) &&
		built.sources.every(
			(e) => e.send === undefined || e.send.state === "queued",
		)
	);
}
