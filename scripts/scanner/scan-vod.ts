/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * CLI equivalent of the VoD tab: scans a video with the full detector registry
 * and writes the same events CSV the tab's Export menu downloads. ffmpeg
 * decodes to raw RGBA frames piped through the DetectorScheduler + detectors
 * and the timeline through the worker's own frame pass. It scans in one lane
 * on ffmpeg's frame grid, so its reads are close to a browser scan's but not
 * the same ones; --replay runs a browser scan again as it ran.
 *
 * Requires ffmpeg (and ffprobe for the progress percentage) on PATH.
 *
 * Usage: pnpm scanner:scan-vod <video> [--fps 8] [--start T] [--duration S] [--out file.csv] [--telemetry] [--gpu] [--record dir] [--tape name [--description text]] [--replay scan-log.json]
 * --telemetry prints the VoD tab's ?telemetry=true scan counters after the run.
 * --gpu matches templates on WebGPU (worker/gpu-matcher.ts) like the browser's
 *   GPU path; needs Dawn (node/webgpu.ts: WEBGPU_NODE). The CSV must stay
 *   byte-identical to a CPU scan's.
 * --record writes every template-match request as a replay corpus for
 *   `pnpm scanner:gpu-replay` (match-corpus.ts).
 * --tape also saves the events as an event tape (tests/tape.ts) for the
 *   golden tests; --description says which builder situations it holds.
 * --replay scans the video the way the scan that wrote the log did
 *   (core/scan-log.ts; a VoD's Game data zip holds it): the frames it analyzed,
 *   in its lanes, following its gate and parse decisions instead of a
 *   scheduler, so the detectors build the state they had. The CSV then is the
 *   browser scan's own, as far as ffmpeg decodes the pixels the browser read;
 *   every gate and read that comes out differently is printed. --start and
 *   --duration pick the stretch to reproduce: each lane reaching into it is
 *   replayed from the lane's start, where the detectors' state began. --fps
 *   does not apply.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import { eventsToCsv } from "../../app/features/scanner/core/csv/events";
import { loadOpenCV, type Mat } from "../../app/features/scanner/core/cv";
import {
	type DetectorOutcome,
	runDetectorPass,
} from "../../app/features/scanner/core/detectors/frame-pass";
import { createAllDetectors } from "../../app/features/scanner/core/detectors/registry";
import {
	type ReplayDivergence,
	replayDetectorPass,
} from "../../app/features/scanner/core/detectors/replay-pass";
import { DetectorScheduler } from "../../app/features/scanner/core/detectors/scheduler";
import { createScanTelemetry } from "../../app/features/scanner/core/detectors/telemetry";
import type { DetectedEvent } from "../../app/features/scanner/core/events";
import * as FieldScores from "../../app/features/scanner/core/field-scores";
import { normalizeFrame, toMat } from "../../app/features/scanner/core/image";
import { withoutInvalidObjectives } from "../../app/features/scanner/core/match-builder";
import { runSync } from "../../app/features/scanner/core/match-steps";
import * as ScanLog from "../../app/features/scanner/core/scan-log";
import {
	changeOf,
	stitchLanes,
	TimelineBuilder,
} from "../../app/features/scanner/core/timeline/index";
import { loadScoreboardResources } from "../../app/features/scanner/node/resources";
import { nodeGpu } from "../../app/features/scanner/node/webgpu";
import * as Tape from "../../app/features/scanner/tests/tape";
import { createGpuMatcher } from "../../app/features/scanner/worker/gpu-matcher";
import { recordingRunner } from "./match-corpus";

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 4;
/** Slightly over the scheduler's densest cadence (refineIntervalS 0.15s). */
const DEFAULT_FPS = 8;
const PROGRESS_INTERVAL_SECONDS = 60;
/** A replay starts decoding this long before the first frame it needs, so the seek cannot land past it. */
const REPLAY_SEEK_MARGIN_S = 2;
/** ffmpeg prints a frame's time to the microsecond; a logged frame is the one within this of its time. */
const REPLAY_FRAME_EPSILON_S = 0.0005;
/** How long after the video's last frame a logged time still shows that frame. */
const REPLAY_END_GRACE_S = 1;
/** Reads with every field score this close came from the same picture decoded by another decoder. */
const REPLAY_READ_TOLERANCE = 0.02;
const USAGE =
	"usage: pnpm scanner:scan-vod <video> [--fps 8] [--start T] [--duration S] [--out file.csv] [--telemetry] [--gpu] [--record dir] [--tape name [--description text]] [--replay scan-log.json]";

const options = parseArgs(process.argv.slice(2));
if (!options) {
	console.error(USAGE);
	process.exit(1);
}
const {
	videoPath,
	fps,
	start,
	duration,
	outPath,
	collectTelemetry,
	gpu,
	recordDir,
	tapeName,
	tapeDescription,
	replayPath,
} = options;

await loadOpenCV();
const matcher = gpu ? await createGpuMatcher(nodeGpu()) : null;
const recorder = recordDir
	? recordingRunner(
			matcher?.run ?? (async (steps) => runSync(steps)),
			recordDir,
		)
	: null;
const runSteps = recorder?.run ?? matcher?.run;
const resources = await loadScoreboardResources();
const telemetry = collectTelemetry ? createScanTelemetry() : null;
/** per detector: the whole frame pass's latency on each frame it parsed */
const passLatencies = new Map<string, number[]>();
let framesDecoded = 0;
let framesAnalyzed = 0;
let nextProgressT = start;
const startedAt = Date.now();

const events =
	replayPath === undefined
		? await scanOnGrid()
		: await replayScan(readScanLog(replayPath));

const csv = eventsToCsv(events);
writeFileSync(outPath, csv);
const tapePath =
	tapeName === undefined
		? null
		: Tape.save({
				name: tapeName,
				description: tapeDescription,
				source: `${basename(videoPath)} ${replayPath === undefined ? `--fps ${fps}` : `--replay ${basename(replayPath)}`} --start ${start}${duration === undefined ? "" : ` --duration ${duration}`}`,
				events,
			});
printSummary();

function parseArgs(argv: string[]): {
	videoPath: string;
	fps: number;
	start: number;
	duration: number | undefined;
	outPath: string;
	collectTelemetry: boolean;
	gpu: boolean;
	recordDir: string | undefined;
	tapeName: string | undefined;
	tapeDescription: string;
	replayPath: string | undefined;
} | null {
	let parsedVideoPath: string | undefined;
	let parsedFps = DEFAULT_FPS;
	let parsedStart = 0;
	let parsedDuration: number | undefined;
	let parsedOutPath: string | undefined;
	let parsedCollectTelemetry = false;
	let parsedGpu = false;
	let parsedRecordDir: string | undefined;
	let parsedTapeName: string | undefined;
	let parsedTapeDescription = "";
	let parsedReplayPath: string | undefined;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--fps") parsedFps = Number(argv[++i]);
		else if (arg === "--start") parsedStart = Number(argv[++i]);
		else if (arg === "--duration") parsedDuration = Number(argv[++i]);
		else if (arg === "--out") parsedOutPath = argv[++i];
		else if (arg === "--telemetry") parsedCollectTelemetry = true;
		else if (arg === "--gpu") parsedGpu = true;
		else if (arg === "--record") parsedRecordDir = argv[++i];
		else if (arg === "--tape") parsedTapeName = argv[++i];
		else if (arg === "--description") parsedTapeDescription = argv[++i] ?? "";
		else if (arg === "--replay") parsedReplayPath = argv[++i];
		else if (!arg.startsWith("--") && parsedVideoPath === undefined)
			parsedVideoPath = arg;
		else return null;
	}
	if (
		parsedVideoPath === undefined ||
		Number.isNaN(parsedFps) ||
		parsedFps <= 0 ||
		Number.isNaN(parsedStart) ||
		(parsedDuration !== undefined && Number.isNaN(parsedDuration))
	) {
		return null;
	}
	return {
		videoPath: parsedVideoPath,
		fps: parsedFps,
		start: parsedStart,
		duration: parsedDuration,
		outPath:
			parsedOutPath ??
			`${basename(parsedVideoPath).replace(/\.[^.]+$/, "")}-events.csv`,
		collectTelemetry: parsedCollectTelemetry,
		gpu: parsedGpu,
		recordDir: parsedRecordDir,
		tapeName: parsedTapeName,
		tapeDescription: parsedTapeDescription,
		replayPath: parsedReplayPath,
	};
}

function probeDurationSeconds(path: string): Promise<number | null> {
	return new Promise((resolve) => {
		const ffprobe = spawn(
			"ffprobe",
			[
				"-v",
				"error",
				"-show_entries",
				"format=duration",
				"-of",
				"default=noprint_wrappers=1:nokey=1",
				path,
			],
			{ stdio: ["ignore", "pipe", "ignore"] },
		);
		let output = "";
		ffprobe.stdout.on("data", (data) => {
			output += data;
		});
		ffprobe.on("close", () => {
			const seconds = Number.parseFloat(output.trim());
			resolve(Number.isFinite(seconds) ? seconds : null);
		});
		ffprobe.on("error", () => resolve(null));
	});
}

/** The plain scan: one lane over ffmpeg's `fps` grid, each frame checked as a scheduler of its own decides. */
async function scanOnGrid(): Promise<readonly DetectedEvent[]> {
	const detectors = createAllDetectors(resources);
	const scheduler = new DetectorScheduler(detectors);
	scheduler.reset(start);
	const timeline = new TimelineBuilder();
	const totalSeconds = await probeDurationSeconds(videoPath);
	const scanEnd =
		duration !== undefined
			? start + duration
			: totalSeconds !== null
				? totalSeconds
				: null;

	const ffmpeg = spawn(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			...(start > 0 ? ["-ss", String(start)] : []),
			"-i",
			videoPath,
			...(duration !== undefined ? ["-t", String(duration)] : []),
			"-vf",
			`fps=${fps},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}`,
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"pipe:1",
		],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);

	const frameBuffer = Buffer.alloc(FRAME_BYTES);
	let frameFill = 0;
	for await (const chunk of ffmpeg.stdout) {
		let offset = 0;
		while (offset < chunk.length) {
			const take = Math.min(FRAME_BYTES - frameFill, chunk.length - offset);
			chunk.copy(frameBuffer, frameFill, offset, offset + take);
			frameFill += take;
			offset += take;
			if (frameFill < FRAME_BYTES) continue;
			frameFill = 0;
			const t = start + framesDecoded / fps;
			framesDecoded++;
			reportProgress("scanning", t, start, scanEnd, timeline.events.length);
			if (telemetry) {
				telemetry.decodedFrames++;
				telemetry.activeVideoS += 1 / fps;
			}
			const due = scheduler.dueDetectors(t);
			if (due.length === 0) continue;
			await analyze(frameBuffer, FRAME_WIDTH, FRAME_HEIGHT, async (frame) => ({
				outcomes: await runDetectorPass({
					frame,
					t,
					detectors,
					due,
					scheduler,
					timeline,
					telemetry,
					runSteps,
				}),
			}));
		}
	}
	const exitCode = await new Promise<number | null>((resolve) =>
		ffmpeg.on("close", resolve),
	);
	if (exitCode !== 0) {
		console.error(`ffmpeg exited with code ${exitCode}`);
		process.exit(1);
	}
	return timeline.events;
}

/**
 * The scan `log` records, run again on the video: every lane with detectors
 * and a timeline of its own, shown the frames it analyzed, then stitched and
 * finished as the browser finishes a scan.
 */
async function replayScan(
	log: ScanLog.ScanLog,
): Promise<readonly DetectedEvent[]> {
	const rangeEnd =
		duration === undefined ? Number.POSITIVE_INFINITY : start + duration;
	const lanes = log.lanes
		.filter((lane) => lane.tStart < rangeEnd && lane.tEnd > start)
		.map((lane) => ({
			tStart: lane.tStart,
			frames: ScanLog.frames(log, lane).filter((frame) => frame.t < rangeEnd),
			detectors: createAllDetectors(resources),
			timeline: new TimelineBuilder(),
			// the lane's timeline by slot key, as the scanning page mirrors it: equal-time events keep the page's order
			events: new Map<number, DetectedEvent>(),
		}));
	const wanted = lanes
		.flatMap((lane) => lane.frames.map((logged) => ({ lane, logged })))
		.sort((a, b) => a.logged.t - b.logged.t);
	if (wanted.length === 0) {
		console.error("the scan log holds no frames in that stretch");
		process.exit(1);
	}
	const video = await probeVideo(videoPath);
	if (!video) {
		console.error(`ffprobe found no video stream in ${videoPath}`);
		process.exit(1);
	}
	const scanned = Math.max(...log.lanes.map((lane) => lane.tEnd));
	if (video.duration !== null && Math.abs(video.duration - scanned) > 1) {
		console.error(
			`warning: the logged scan covered ${scanned.toFixed(1)}s, this video is ${video.duration.toFixed(1)}s long`,
		);
	}
	console.error(
		`replaying ${wanted.length} of ${ScanLog.frameCount(log)} logged frames in ${lanes.length} of ${log.lanes.length} lane(s)`,
	);

	const tally = {
		exactFrames: 0,
		offFrames: 0,
		maxOffsetS: 0,
		missingFrames: 0,
		checks: 0,
		gatesDiffering: 0,
		parses: 0,
		readsClose: 0,
		readsDiffering: 0,
		unknownDetectors: new Set<string>(),
	};
	const firstT = wanted[0]!.logged.t;
	const replayEnd = wanted.at(-1)!.logged.t;
	nextProgressT = firstT;
	let next = 0;
	/** Replays every logged frame before `untilT` on `picture`, the last frame decoded before it. */
	const replayUntil = async (untilT: number, picture: DecodedFrame | null) => {
		while (next < wanted.length) {
			const { lane, logged } = wanted[next]!;
			if (logged.t + REPLAY_FRAME_EPSILON_S >= untilT) return;
			next++;
			if (!picture) {
				tally.missingFrames++;
				console.error(
					`  missing t=${logged.t.toFixed(3)}: before the video's first frame`,
				);
				continue;
			}
			const offset = logged.t - picture.t;
			if (Math.abs(offset) <= REPLAY_FRAME_EPSILON_S) tally.exactFrames++;
			else tally.offFrames++;
			tally.maxOffsetS = Math.max(tally.maxOffsetS, offset);
			reportProgress("replaying", logged.t, firstT, replayEnd, eventCount());
			const { outcomes, divergences } = await analyze(
				picture.pixels,
				video.width,
				video.height,
				(frame) =>
					replayDetectorPass({
						frame,
						logged,
						detectors: lane.detectors,
						timeline: lane.timeline,
						telemetry,
						runSteps,
					}),
			);
			for (const { actions } of outcomes) {
				for (const action of actions) {
					const change = changeOf(action);
					if (change) lane.events.set(change.key, change.event);
				}
			}
			tally.checks += logged.checks.length;
			tally.parses += logged.checks.filter((check) => check.parsed).length;
			for (const divergence of divergences) {
				if (divergence.kind === "detector") {
					tally.unknownDetectors.add(divergence.detector);
					continue;
				}
				if (divergence.kind === "reads" && readsClose(divergence)) {
					tally.readsClose++;
					continue;
				}
				if (divergence.kind === "gate") tally.gatesDiffering++;
				else tally.readsDiffering++;
				console.error(
					`  differs t=${logged.t.toFixed(3)} ${describeDivergence(divergence)}`,
				);
			}
		}
	};
	const eventCount = () =>
		lanes.reduce((sum, lane) => sum + lane.events.size, 0);

	let held: DecodedFrame | null = null;
	for await (const frame of decodeFrames(
		videoPath,
		Math.max(0, firstT - REPLAY_SEEK_MARGIN_S),
		video,
	)) {
		framesDecoded++;
		if (telemetry) {
			telemetry.decodedFrames++;
			if (held) telemetry.activeVideoS += frame.t - held.t;
		}
		await replayUntil(frame.t, held);
		if (next >= wanted.length) break;
		held = frame;
	}
	const last: DecodedFrame | null = held;
	await replayUntil(
		last ? last.t + REPLAY_END_GRACE_S : Number.NEGATIVE_INFINITY,
		last,
	);
	for (const { logged } of wanted.slice(next)) {
		tally.missingFrames++;
		console.error(
			`  missing t=${logged.t.toFixed(3)}: after the video's last frame`,
		);
	}

	const replayed = tally.exactFrames + tally.offFrames;
	console.error(
		`replay: ${replayed} of ${wanted.length} logged frames replayed, ${tally.exactFrames} at their logged timestamp`,
	);
	if (tally.offFrames > 0) {
		console.error(
			`  ${tally.offFrames} logged times fall between two frames of this video (up to ${(tally.maxOffsetS * 1000).toFixed(1)} ms after the frame shown): another encode than the one scanned, or a scan that read by seeking`,
		);
	}
	if (tally.missingFrames > 0) {
		console.error(
			`  ${tally.missingFrames} logged frames are not in the video`,
		);
	}
	if (tally.unknownDetectors.size > 0) {
		console.error(
			`  the scan ran detectors this build lacks: ${[...tally.unknownDetectors].join(", ")}`,
		);
	}
	console.error(
		`  gates: ${tally.checks - tally.gatesDiffering} of ${tally.checks} as logged`,
	);
	console.error(
		`  parses: ${tally.parses - tally.readsClose - tally.readsDiffering} of ${tally.parses} read as logged, ${tally.readsClose} with every field score within ${REPLAY_READ_TOLERANCE}, ${tally.readsDiffering} differently`,
	);

	return withoutInvalidObjectives(
		stitchLanes(
			lanes.map((lane) => ({
				tStart: lane.tStart,
				events: [...lane.events.values()],
			})),
		),
	);
}

/** Same event types in the same order scoring as many fields, no score further off than another decoder's pixels put it. */
function readsClose({
	logged,
	replayed,
}: Extract<ReplayDivergence, { kind: "reads" }>): boolean {
	return (
		logged.length === replayed.length &&
		logged.every(
			(read, i) =>
				read.type === replayed[i]!.type &&
				read.scores.length === replayed[i]!.scores.length &&
				read.scores.every(
					(score, at) =>
						Math.abs(score - replayed[i]!.scores[at]!) <= REPLAY_READ_TOLERANCE,
				),
		)
	);
}

function meanOf(scores: readonly number[]): number {
	return scores.reduce((sum, score) => sum + score, 0) / (scores.length || 1);
}

function describeDivergence(
	divergence: Exclude<ReplayDivergence, { kind: "detector" }>,
): string {
	if (divergence.kind === "gate") {
		const verdict = ({ pass, variant }: typeof divergence.logged) =>
			pass ? `pass${variant === undefined ? "" : ` (${variant})`}` : "fail";
		return `${divergence.detector} gate: scan ${verdict(divergence.logged)}, replay ${verdict(divergence.replayed)}`;
	}
	const reads = (list: readonly ScanLog.ScanLogRead[]) =>
		list
			.map(
				(read) =>
					`${read.type}@${meanOf(read.scores).toFixed(4)} (${read.scores.length} fields)`,
			)
			.join(", ") || "nothing";
	return `${divergence.detector} read: scan ${reads(divergence.logged)}, replay ${reads(divergence.replayed)}`;
}

function readScanLog(path: string): ScanLog.ScanLog {
	try {
		return ScanLog.parse(JSON.parse(readFileSync(path, "utf8")));
	} catch (error) {
		console.error(
			`${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}

interface VideoInfo {
	width: number;
	height: number;
	/** seconds; null when the container does not say */
	duration: number | null;
}

interface DecodedFrame {
	/** seconds, the frame's own timestamp in the file */
	t: number;
	/** RGBA at the video's size; valid until the frame after the next is decoded */
	pixels: Buffer;
}

/**
 * Every frame of the video from `fromT` on, at its own size and timestamp.
 * ffmpeg prints each frame's time on a side pipe before it writes the frame
 * (the `metadata` filter prints only frames carrying a key, so one is added),
 * and passes frames through one for one so the two streams pair up.
 */
async function* decodeFrames(
	path: string,
	fromT: number,
	{ width, height }: VideoInfo,
): AsyncGenerator<DecodedFrame> {
	const ffmpeg = spawn(
		"ffmpeg",
		[
			"-hide_banner",
			"-loglevel",
			"error",
			...(fromT > 0 ? ["-ss", String(fromT)] : []),
			"-copyts",
			"-i",
			path,
			"-map",
			"0:v:0",
			"-vf",
			"metadata=mode=add:key=frame:value=1,metadata=mode=print:file='pipe\\:3':direct=1",
			"-fps_mode",
			"passthrough",
			"-f",
			"rawvideo",
			"-pix_fmt",
			"rgba",
			"pipe:1",
		],
		{ stdio: ["ignore", "pipe", "pipe", "pipe"] },
	);
	const closed = new Promise<number | null>((resolve) =>
		ffmpeg.on("close", resolve),
	);
	// shown only if ffmpeg fails: stopping it early makes it complain about the closed pipe
	let errors = "";
	(ffmpeg.stdio[2] as Readable).on("data", (data) => {
		errors += data;
	});
	const stamps = createInterface({ input: ffmpeg.stdio[3] as Readable })[
		Symbol.asyncIterator
	]();
	const nextStamp = async (): Promise<number> => {
		for (;;) {
			const line = await stamps.next();
			if (line.done) throw new Error("ffmpeg gave a frame no timestamp");
			const stamp = /^frame:\d+\s+pts:\S+\s+pts_time:(\S+)/.exec(line.value);
			if (stamp) return Number(stamp[1]);
		}
	};

	const frameBytes = width * height * 4;
	const buffers = [Buffer.alloc(frameBytes), Buffer.alloc(frameBytes)];
	let filling = 0;
	let fill = 0;
	let finished = false;
	try {
		for await (const chunk of ffmpeg.stdout as AsyncIterable<Buffer>) {
			let offset = 0;
			while (offset < chunk.length) {
				const pixels = buffers[filling]!;
				const take = Math.min(frameBytes - fill, chunk.length - offset);
				chunk.copy(pixels, fill, offset, offset + take);
				fill += take;
				offset += take;
				if (fill < frameBytes) continue;
				fill = 0;
				filling = 1 - filling;
				yield { t: await nextStamp(), pixels };
			}
		}
		finished = true;
		const exitCode = await closed;
		if (exitCode !== 0) {
			throw new Error(`ffmpeg exited with code ${exitCode}: ${errors.trim()}`);
		}
	} finally {
		if (!finished) ffmpeg.kill("SIGKILL");
	}
}

function probeVideo(path: string): Promise<VideoInfo | null> {
	return new Promise((resolve) => {
		const ffprobe = spawn(
			"ffprobe",
			[
				"-v",
				"error",
				"-select_streams",
				"v:0",
				"-show_entries",
				"stream=width,height:format=duration",
				"-of",
				"json",
				path,
			],
			{ stdio: ["ignore", "pipe", "ignore"] },
		);
		let output = "";
		ffprobe.stdout.on("data", (data) => {
			output += data;
		});
		ffprobe.on("close", () => {
			try {
				const { streams, format } = JSON.parse(output) as {
					streams?: { width?: number; height?: number }[];
					format?: { duration?: string };
				};
				const stream = streams?.[0];
				const seconds = Number.parseFloat(format?.duration ?? "");
				resolve(
					stream?.width && stream.height
						? {
								width: stream.width,
								height: stream.height,
								duration: Number.isFinite(seconds) ? seconds : null,
							}
						: null,
				);
			} catch {
				resolve(null);
			}
		});
		ffprobe.on("error", () => resolve(null));
	});
}

function reportProgress(
	verb: string,
	t: number,
	fromT: number,
	endT: number | null,
	eventCount: number,
): void {
	if (t < nextProgressT) return;
	const percent =
		endT === null || endT <= fromT
			? ""
			: ` (${Math.round(((t - fromT) / (endT - fromT)) * 100)}%)`;
	const rate = (t - fromT) / Math.max(0.001, (Date.now() - startedAt) / 1000);
	console.error(
		`${verb} t=${Math.round(t)}s${percent} · ${rate.toFixed(1)}x realtime · ${eventCount} events`,
	);
	while (nextProgressT <= t) nextProgressT += PROGRESS_INTERVAL_SECONDS;
}

/** Normalizes the decoded frame and runs `pass` on it, timing the pass and printing the events it listed. */
async function analyze<T extends { outcomes: DetectorOutcome[] }>(
	pixels: Buffer,
	width: number,
	height: number,
	pass: (frame: Mat) => Promise<T>,
): Promise<T> {
	framesAnalyzed++;
	if (telemetry) telemetry.analyzedFrames++;
	const src = toMat({
		width,
		height,
		data: new Uint8ClampedArray(
			pixels.buffer,
			pixels.byteOffset,
			width * height * 4,
		),
	});
	const frame = normalizeFrame(src);
	src.delete();
	try {
		const passStart = performance.now();
		const result = await pass(frame);
		const { outcomes } = result;
		if (telemetry) {
			const ms = performance.now() - passStart;
			for (const { detector, parsed } of outcomes) {
				if (!parsed) continue;
				const list = passLatencies.get(detector.id) ?? [];
				list.push(ms);
				passLatencies.set(detector.id, list);
			}
		}
		for (const { actions } of outcomes) {
			for (const action of actions) {
				if (action.action === "added" || action.action === "replaced") {
					const { event } = action;
					console.error(
						`  event t=${event.t.toFixed(2)} ${event.type} score=${FieldScores.mean(event.scores).toFixed(3)}`,
					);
				}
			}
		}
		return result;
	} finally {
		frame.delete();
	}
}

function printSummary(): void {
	const counts = new Map<string, number>();
	for (const event of events) {
		counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
	}
	const countText =
		[...counts.entries()].map(([type, n]) => `${type} ${n}`).join(", ") ||
		"none";
	console.error(
		`analyzed ${framesAnalyzed}/${framesDecoded} decoded frames in ${Math.round((Date.now() - startedAt) / 1000)}s`,
	);
	console.error(`timeline events: ${events.length} (${countText})`);
	console.error(`wrote ${outPath}`);
	if (tapePath) console.error(`wrote ${tapePath}`);
	if (telemetry) printTelemetry();
	if (matcher) console.error(`GPU matcher: ${JSON.stringify(matcher.stats)}`);
	if (recorder) console.error(recorder.save());
	console.error(`next: pnpm scanner:status-audit ${outPath}`);
}

/** The VoD tab's ?telemetry=true panel, as an aligned stderr table. */
function printTelemetry(): void {
	if (!telemetry) return;
	telemetry.wallMs = Date.now() - startedAt;
	console.error(
		`telemetry · analyzed ${telemetry.analyzedFrames}/${telemetry.decodedFrames} decoded frames · ${(telemetry.wallMs / 1000).toFixed(1)}s wall · ${telemetry.activeVideoS.toFixed(0)}s video covered (dense, no skim in CLI)`,
	);
	const header = [
		"detector",
		"checks",
		"gate pass",
		"gate ms",
		"parses",
		"parse ms",
		"suppressed",
	];
	const rows = Object.entries(telemetry.detectors)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([id, d]) => [
			id,
			String(d.checks),
			String(d.gatePasses),
			String(Math.round(d.gateMs)),
			String(d.parses),
			String(Math.round(d.parseMs)),
			String(d.suppressedParses),
		]);
	const widths = header.map((h, i) =>
		Math.max(h.length, ...rows.map((row) => row[i]!.length)),
	);
	const line = (cells: string[]) =>
		cells
			.map((cell, i) =>
				i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!),
			)
			.join("  ");
	console.error(line(header));
	for (const row of rows) console.error(line(row));
	// how long a frame waits for its results when the detector parses it: the
	// whole pass (every gate and parse of the frame, GPU round trips included)
	for (const [id, list] of [...passLatencies].sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		const sorted = [...list].sort((a, b) => a - b);
		const mean = sorted.reduce((sum, ms) => sum + ms, 0) / sorted.length;
		const p95 =
			sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
		console.error(
			`frame pass with a ${id} parse: mean ${mean.toFixed(1)} ms · p95 ${p95.toFixed(1)} ms · max ${sorted[sorted.length - 1]!.toFixed(1)} ms (${sorted.length} frames)`,
		);
	}
}
