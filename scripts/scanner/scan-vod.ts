/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * CLI equivalent of the VoD tab: scans a video with the full detector registry
 * and writes the same events CSV the tab's Export menu downloads. ffmpeg
 * decodes to raw RGBA frames piped through the DetectorScheduler + detectors
 * and a TimelineBuilder with the tab's default options, so the CSV matches a
 * browser scan (minus keyframe skimming, which only affects speed).
 *
 * Requires ffmpeg (and ffprobe for the progress percentage) on PATH.
 *
 * Usage: pnpm scanner:scan-vod <video> [--fps 8] [--start T] [--duration S] [--out file.csv] [--telemetry]
 * --telemetry prints the VoD tab's ?telemetry=true scan counters after the run.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename } from "node:path";
import {
	type CsvEvent,
	eventsToCsv,
} from "../../app/features/scanner/components/events-csv";
import { loadOpenCV } from "../../app/features/scanner/core/cv";
import { MAP_START_EVENT_TYPE } from "../../app/features/scanner/core/detectors/map-start/index";
import {
	createAllDetectors,
	SCOREBOARD_EVENT_TYPES,
} from "../../app/features/scanner/core/detectors/registry";
import { DetectorScheduler } from "../../app/features/scanner/core/detectors/scheduler";
import {
	createScanTelemetry,
	detectorTelemetry,
} from "../../app/features/scanner/core/detectors/telemetry";
import { normalizeFrame, toMat } from "../../app/features/scanner/core/image";
import { TimelineBuilder } from "../../app/features/scanner/core/timeline/index";
import { loadScoreboardResources } from "../../app/features/scanner/node/resources";

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 4;
/** Slightly over the scheduler's densest cadence (refineIntervalS 0.15s). */
const DEFAULT_FPS = 8;
const PROGRESS_INTERVAL_SECONDS = 60;

const options = parseArgs(process.argv.slice(2));
if (!options) {
	console.error(
		"usage: pnpm scanner:scan-vod <video> [--fps 8] [--start T] [--duration S] [--out file.csv] [--telemetry]",
	);
	process.exit(1);
}
const { videoPath, fps, start, duration, outPath, collectTelemetry } = options;

await loadOpenCV();
const detectors = createAllDetectors(await loadScoreboardResources());
const scheduler = new DetectorScheduler(detectors, {
	matchOpeningTypes: [MAP_START_EVENT_TYPE],
	matchClosingTypes: SCOREBOARD_EVENT_TYPES,
});
scheduler.reset(start);
const timeline = new TimelineBuilder();
const telemetry = collectTelemetry ? createScanTelemetry() : null;

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
let frameIndex = 0;
let framesAnalyzed = 0;
let nextProgressT = start;
const startedAt = Date.now();

for await (const chunk of ffmpeg.stdout) {
	let offset = 0;
	while (offset < chunk.length) {
		const take = Math.min(FRAME_BYTES - frameFill, chunk.length - offset);
		chunk.copy(frameBuffer, frameFill, offset, offset + take);
		frameFill += take;
		offset += take;
		if (frameFill < FRAME_BYTES) continue;
		frameFill = 0;
		processFrame(start + frameIndex / fps);
		frameIndex++;
	}
}
const exitCode = await new Promise<number | null>((resolve) =>
	ffmpeg.on("close", resolve),
);
if (exitCode !== 0) {
	console.error(`ffmpeg exited with code ${exitCode}`);
	process.exit(1);
}

const csv = eventsToCsv(timeline.events as CsvEvent[]);
writeFileSync(outPath, csv);
printSummary();

function parseArgs(argv: string[]): {
	videoPath: string;
	fps: number;
	start: number;
	duration: number | undefined;
	outPath: string;
	collectTelemetry: boolean;
} | null {
	let videoPath: string | undefined;
	let fps = DEFAULT_FPS;
	let start = 0;
	let duration: number | undefined;
	let outPath: string | undefined;
	let collectTelemetry = false;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--fps") fps = Number(argv[++i]);
		else if (arg === "--start") start = Number(argv[++i]);
		else if (arg === "--duration") duration = Number(argv[++i]);
		else if (arg === "--out") outPath = argv[++i];
		else if (arg === "--telemetry") collectTelemetry = true;
		else if (!arg.startsWith("--") && videoPath === undefined) videoPath = arg;
		else return null;
	}
	if (
		videoPath === undefined ||
		Number.isNaN(fps) ||
		fps <= 0 ||
		Number.isNaN(start) ||
		(duration !== undefined && Number.isNaN(duration))
	) {
		return null;
	}
	return {
		videoPath,
		fps,
		start,
		duration,
		outPath:
			outPath ?? `${basename(videoPath).replace(/\.[^.]+$/, "")}-events.csv`,
		collectTelemetry,
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

function processFrame(t: number): void {
	if (t >= nextProgressT) {
		const percent =
			scanEnd === null
				? ""
				: ` (${Math.round(((t - start) / (scanEnd - start)) * 100)}%)`;
		const rate = (t - start) / Math.max(0.001, (Date.now() - startedAt) / 1000);
		console.error(
			`scanning t=${Math.round(t)}s${percent} · ${rate.toFixed(1)}x realtime · ${timeline.events.length} events`,
		);
		nextProgressT += PROGRESS_INTERVAL_SECONDS;
	}

	if (telemetry) {
		telemetry.decodedFrames++;
		telemetry.activeVideoS += 1 / fps;
	}
	const due = scheduler.dueDetectors(t);
	if (due.length === 0) return;
	framesAnalyzed++;
	if (telemetry) telemetry.analyzedFrames++;
	const src = toMat({
		width: FRAME_WIDTH,
		height: FRAME_HEIGHT,
		data: new Uint8ClampedArray(
			frameBuffer.buffer,
			frameBuffer.byteOffset,
			FRAME_BYTES,
		),
	});
	const frame = normalizeFrame(src);
	src.delete();
	for (const detector of detectors) {
		if (!due.includes(detector.id)) continue;
		const counters = telemetry
			? detectorTelemetry(telemetry, detector.id)
			: null;
		const gateStart = counters ? performance.now() : 0;
		const gate = detector.gate(frame);
		if (counters) {
			counters.checks++;
			counters.gateMs += performance.now() - gateStart;
		}
		scheduler.recordGate(detector.id, t, gate.pass, gate.signature);
		if (!gate.pass) continue;
		if (counters) counters.gatePasses++;
		if (!scheduler.shouldParse(detector.id, t)) {
			if (counters) counters.suppressedParses++;
			continue;
		}
		const parseStart = counters ? performance.now() : 0;
		const events = detector.parse(frame, t, gate);
		if (counters) {
			counters.parses++;
			counters.parseMs += performance.now() - parseStart;
		}
		scheduler.recordParse(detector.id, t, events);
		for (const event of events) {
			const action = timeline.push(event);
			if (action.action === "added" || action.action === "replaced") {
				console.error(
					`  event t=${event.t.toFixed(2)} ${event.type} conf=${event.confidence.toFixed(3)}`,
				);
			}
		}
	}
	frame.delete();
}

function printSummary(): void {
	const counts = new Map<string, number>();
	for (const event of timeline.events) {
		counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
	}
	const countText =
		[...counts.entries()].map(([type, n]) => `${type} ${n}`).join(", ") ||
		"none";
	console.error(
		`analyzed ${framesAnalyzed}/${frameIndex} decoded frames in ${Math.round((Date.now() - startedAt) / 1000)}s`,
	);
	console.error(`timeline events: ${timeline.events.length} (${countText})`);
	console.error(`wrote ${outPath}`);
	if (telemetry) printTelemetry();
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
}
