/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * CLI harness: replay a directory of extracted VoD frames through the full
 * detector registry driven by a DetectorScheduler, mirroring the analyzer
 * worker's chunk scan — to reproduce scheduling-dependent misses offline.
 * This is the tool for "the browser scan missed an event that a fixture
 * parses fine": extract the surrounding footage with
 *   ffmpeg -ss <startT> -i vod.mkv -t 30 -vf fps=6 frames/f%04d.png
 * then replay it and watch which checks the scheduler ran and what they saw.
 *
 * Usage: pnpm scanner:replay <framesDir> <startT> <fps>
 * (frames are ffmpeg-numbered f0001.png..; t = startT + (n-1)/fps)
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadOpenCV } from "../../app/features/scanner/core/cv";
import { MAP_START_EVENT_TYPE } from "../../app/features/scanner/core/detectors/map-start/index";
import {
	createAllDetectors,
	SCOREBOARD_EVENT_TYPES,
} from "../../app/features/scanner/core/detectors/registry";
import { DetectorScheduler } from "../../app/features/scanner/core/detectors/scheduler";
import { normalizeFrame, toMat } from "../../app/features/scanner/core/image";
import { readImage } from "../../app/features/scanner/node/image-io";
import { loadScoreboardResources } from "../../app/features/scanner/node/resources";

const [framesDir, startTArg, fpsArg] = process.argv.slice(2);
if (!framesDir || !startTArg || !fpsArg) {
	console.error("usage: pnpm scanner:replay <framesDir> <startT> <fps>");
	process.exit(1);
}
const startT = Number(startTArg);
const fps = Number(fpsArg);

await loadOpenCV();
const detectors = createAllDetectors(await loadScoreboardResources());
const scheduler = new DetectorScheduler(detectors, {
	matchOpeningTypes: [MAP_START_EVENT_TYPE],
	matchClosingTypes: SCOREBOARD_EVENT_TYPES,
});
scheduler.reset(startT);

const files = readdirSync(framesDir)
	.filter((f) => f.endsWith(".png"))
	.sort();

for (const [i, file] of files.entries()) {
	const t = startT + i / fps;
	const due = scheduler.dueDetectors(t);
	if (due.length === 0) continue;
	const image = await readImage(join(framesDir, file));
	const src = toMat(image);
	const frame = normalizeFrame(src);
	src.delete();
	for (const detector of detectors) {
		if (!due.includes(detector.id)) continue;
		const gate = detector.gate(frame);
		scheduler.recordGate(detector.id, t, gate.pass, gate.signature);
		if (!gate.pass) {
			if (process.env.LOG_GATES?.includes(detector.id)) {
				console.log(
					`${t.toFixed(2)} ${file} ${detector.id} gate=${gate.score.toFixed(3)} FAIL`,
				);
			}
			continue;
		}
		if (!scheduler.shouldParse(detector.id, t)) {
			console.log(
				`${t.toFixed(2)} ${file} ${detector.id} gate=${gate.score.toFixed(3)} PARSE-SUPPRESSED`,
			);
			continue;
		}
		const events = detector.parse(frame, t, gate);
		scheduler.recordParse(detector.id, t, events);
		console.log(
			`${t.toFixed(2)} ${file} ${detector.id} gate=${gate.score.toFixed(3)} events=[${events
				.map((e) => `${e.type}@${e.confidence.toFixed(3)}`)
				.join(", ")}]`,
		);
	}
	frame.delete();
}
