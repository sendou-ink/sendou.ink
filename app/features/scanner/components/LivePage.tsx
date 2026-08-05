import { useCallback, useEffect, useRef, useState } from "react";
import {
	listVideoInputs,
	openVirtualCamera,
	startSampler,
} from "../capture/sampler";
import { DEATH_EVENT_TYPE } from "../core/detectors/death/index";
import { MAP_START_EVENT_TYPE } from "../core/detectors/map-start/index";
import { MINIMAP_EVENT_TYPE } from "../core/detectors/minimap/index";
import { SCOREBOARD_EVENT_TYPES } from "../core/detectors/registry";
import type { DetectedEvent, GateResult } from "../core/detectors/types";
import type { BuiltMatch } from "../core/match-builder";
import { buildScannerMatches, isIngestableMatch } from "../core/match-builder";
import { TimelineBuilder } from "../core/timeline/index";
import {
	clearEvents,
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
		void listEvents().then((events) =>
			setFeed(
				events.sort(
					(a, b) => b.detectedAt - a.detectedAt || (b.id ?? 0) - (a.id ?? 0),
				),
			),
		);
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
						const action = timelineRef.current.push(event);
						if (action.action === "added" || action.action === "replaced") {
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
					{[...buildScannerMatches(feed)]
						.reverse()
						.map((built, reverseIndex) => {
							const id = built.sources[0]!.id!;
							const ingestable = isIngestableMatch(built.match);
							return (
								<MatchCard
									key={id}
									match={built.match}
									live={
										running && reverseIndex === 0 && built.match.winner === null
									}
									inProgress={reverseIndex === 0 && built.match.winner === null}
									ingestable={ingestable}
									send={aggregateSendStatus(built.sources)}
									onSend={
										SENDOU_UPLOAD_ENABLED && sendouUser && ingestable
											? () => void send(matchContaining(id), { manual: true })
											: undefined
									}
								>
									{withoutRepeatEvents(built.sources).map((e) => (
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
						})}
					{feed.length > 0 ? (
						<EventsSummary
							events={feed}
							open={eventsOpen}
							onToggle={() => setEventsOpen(!eventsOpen)}
						/>
					) : null}
					{eventsOpen
						? feed.map((e) => (
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
