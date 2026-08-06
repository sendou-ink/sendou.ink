import { useCallback, useEffect, useRef, useState } from "react";
import {
	listVideoInputs,
	openVirtualCamera,
	startSampler,
} from "../capture/sampler";
import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import {
	MAP_START_EVENT_TYPE,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "../core/detectors/minimap/index";
import {
	OBJECTIVE_EVENT_TYPE,
	type ObjectiveData,
} from "../core/detectors/objective/index";
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
import { SENDOU_UPLOAD_ENABLED } from "./flags";
import { MatchCard } from "./MatchCard";
import { MatchLobbyTabs } from "./MatchLobbyTabs";
import { ObjectiveTimeline } from "./ObjectiveTimeline";
import {
	aggregateSendStatus,
	matchContaining,
	type SendouUser,
	sendMatches,
	unsentMatches,
} from "./sendou-ingest";
import { thumbnailFromBlob } from "./thumbnail";

const SAMPLE_FPS = 2;

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

	const refreshFeed = useCallback(() => {
		void (async () => {
			const events = await listEvents();
			// objective reads grouped into a known non-SZ match slipped past the
			// live block (e.g. the mode read arrived after them) — delete them
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
						(a, b) => b.detectedAt - a.detectedAt || (b.id ?? 0) - (a.id ?? 0),
					),
			);
		})();
	}, []);

	useEffect(() => {
		refreshFeed();
		return () => {
			stopRef.current?.();
			clientRef.current?.dispose();
		};
	}, [refreshFeed]);

	/** Sends the matches `include` selects; serialized so sends never overlap. */
	const send = useCallback(
		async (
			include: (built: BuiltMatch<StoredEvent>) => boolean,
			{ manual = false } = {},
		) => {
			if (sendingRef.current) return;
			sendingRef.current = true;
			if (manual) setSendouError(null);
			try {
				const events = await listEvents();
				const { sentMatches, failedMatches } = await sendMatches({
					events,
					include,
					onStatus: refreshFeed,
				});
				if (manual && sentMatches + failedMatches === 0) {
					setSendouError("nothing to send — no complete match selected");
				}
			} finally {
				sendingRef.current = false;
				refreshFeed();
			}
		},
		[refreshFeed],
	);

	const start = useCallback(async () => {
		setError(null);
		setStatus("loading");
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
							event.type === OBJECTIVE_EVENT_TYPE &&
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
			);
			await clientRef.current.whenReady();

			stopRef.current = startSampler(video, SAMPLE_FPS, (bitmap, t) => {
				clientRef.current?.analyze(bitmap, t);
			});
			setStatus("watching");
			setRunning(true);
		} catch (e) {
			setError(String(e));
			setStatus("error");
		}
	}, [deviceId, refreshFeed, send]);

	const builtMatches = buildScannerMatches(feed);
	const skipReasons = ingestSkipReasons(builtMatches);
	const groupedEvents = new Set(builtMatches.flatMap((b) => b.sources));
	const ungroupedFeed = feed.filter((e) => !groupedEvents.has(e));

	const stop = useCallback(() => {
		stopRef.current?.();
		stopRef.current = null;
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
	}, [send]);

	return (
		<div>
			<div className="controls">
				{!running ? (
					<button type="button" onClick={() => void start()}>
						Start capture
					</button>
				) : (
					<button type="button" onClick={stop}>
						Stop
					</button>
				)}
				<select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
					<option value="">Default camera (OBS Virtual Camera)</option>
					{devices.map((d) => (
						<option key={d.deviceId} value={d.deviceId}>
							{d.label || d.deviceId.slice(0, 8)}
						</option>
					))}
				</select>
				<span
					className={`status ${status === "detected" ? "detected" : status === "watching" ? "watching" : "idle"}`}
				>
					{status}
					{gateScore !== null && ` · gate ${gateScore.toFixed(2)}`}
				</span>
				<button
					type="button"
					disabled={!running}
					onClick={() =>
						void saveFixture(videoRef.current!, latestParseRef.current)
					}
				>
					Save frame as fixture
				</button>
				<button
					type="button"
					disabled={feed.length === 0}
					onClick={() =>
						downloadEventsCsv(
							`live-events-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`,
							// feed is newest-first for display; export in chronological order
							[...feed].sort(
								(a, b) =>
									a.detectedAt - b.detectedAt || (a.id ?? 0) - (b.id ?? 0),
							),
						)
					}
				>
					Download CSV
				</button>
				<button
					type="button"
					onClick={() => {
						void clearEvents().then(refreshFeed);
					}}
				>
					Clear feed
				</button>
			</div>
			{SENDOU_UPLOAD_ENABLED && (
				<div className="controls">
					<button
						type="button"
						disabled={!sendouUser}
						onClick={() => {
							liveSendRef.current = !liveSend;
							setLiveSend(!liveSend);
						}}
					>
						{liveSend ? "Stop live send" : "Start live send"}
					</button>
					<button
						type="button"
						disabled={!sendouUser || feed.length === 0}
						onClick={() => void send(unsentMatches, { manual: true })}
					>
						Send unsent to sendou.ink
					</button>
					{liveSend && (
						<span className="status watching">sending matches live</span>
					)}
				</div>
			)}
			{error && <p className="error">{error}</p>}
			{sendouError && <p className="error">{sendouError}</p>}
			<div className="live-layout">
				<video ref={videoRef} className="preview" muted playsInline />
				<div className="feed">
					{feed.length === 0 ? (
						<p className="score">No detections yet.</p>
					) : null}
					<MatchLobbyTabs
						matches={builtMatches}
						keyOf={(built) => built.sources[0]!.id!}
						renderMatch={(built, justFormed) => {
							const id = built.sources[0]!.id!;
							const skipReason = skipReasons.get(built);
							// counter reads render as one timeline chart, not a card each;
							// a non-SZ match's reads (objective null) are never shown
							const objectiveEvents = built.match.objective
								? built.sources
										.filter((e) => e.type === OBJECTIVE_EVENT_TYPE)
										.map((e) => ({ t: e.t, data: e.data as ObjectiveData }))
								: [];
							const cardEvents = withoutRepeatEvents(built.sources).filter(
								(e) => e.type !== OBJECTIVE_EVENT_TYPE,
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
										SENDOU_UPLOAD_ENABLED && sendouUser && !skipReason
											? () => void send(matchContaining(id), { manual: true })
											: undefined
									}
								>
									{objectiveEvents.length > 0 ? (
										<ObjectiveTimeline events={objectiveEvents} />
									) : null}
									{cardEvents.map((e) => (
										<EventCard
											key={e.id}
											type={e.type}
											t={e.t}
											confidence={e.confidence}
											data={e.data as FixtureData}
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
									thumbnail={e.thumbnail}
									detectedAt={e.detectedAt}
									getFrame={
										e.hasFrame && e.id !== undefined
											? () => loadEventFrame(e.id!)
											: undefined
									}
									send={e.send}
									onSend={
										SENDOU_UPLOAD_ENABLED &&
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
				</div>
			</div>
		</div>
	);
}
