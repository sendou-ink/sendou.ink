/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * GPU parity over every fixture frame: each detector gates the frame, then
 * parses it twice — synchronously on the CPU (runSync) and through the WebGPU
 * matcher (separate detector instances, so memo state never crosses). Both
 * drivers score exactly, so the two event lists must be byte-identical, raw
 * scores included. Also checks the GPU frame upscale
 * (worker/gpu-frame-scaler.ts) pixel-for-pixel against normalizeFrame on each
 * frame, and the readback's 2160p downscale and bar detection
 * (worker/area-downscaler.ts, worker/gpu-line-sums.ts) on each frame
 * upscaled to 2160p. WebGPU comes from Dawn (node/webgpu.ts: WEBGPU_NODE).
 *
 * Usage: pnpm scanner:gpu-parity [--verbose]
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	detectContentBox,
	detectContentBoxFromSums,
} from "../../app/features/scanner/core/canonical";
import {
	getCV,
	loadOpenCV,
	type Mat,
} from "../../app/features/scanner/core/cv";
import { createAllDetectors } from "../../app/features/scanner/core/detectors/registry";
import { normalizeFrame, toMat } from "../../app/features/scanner/core/image";
import { FIXTURES_DIR } from "../../app/features/scanner/node/fixtures";
import { readImage } from "../../app/features/scanner/node/image-io";
import { loadScoreboardResources } from "../../app/features/scanner/node/resources";
import { nodeGpu } from "../../app/features/scanner/node/webgpu";
import { createAreaDownscaler } from "../../app/features/scanner/worker/area-downscaler";
import { createGpuFrameScaler } from "../../app/features/scanner/worker/gpu-frame-scaler";
import { createLineSumsKernel } from "../../app/features/scanner/worker/gpu-line-sums";
import { createGpuMatcher } from "../../app/features/scanner/worker/gpu-matcher";

/** Fields that carry raw match scores; everything else is a decision. */
const SCORE_FIELDS = new Set([
	"confidence",
	"score",
	"ncc",
	"teamColor",
	"debug",
]);

const verbose = process.argv.includes("--verbose");

await loadOpenCV();
const resources = await loadScoreboardResources();
const matcher = await createGpuMatcher(nodeGpu());
const scaler = await createGpuFrameScaler(matcher.device);
const downscaler = await createAreaDownscaler(matcher.device);
const lineSums = await createLineSumsKernel(matcher.device);

let rows = 0;
let identicalRows = 0;
let decisionRows = 0;
let pixelMismatchFrames = 0;
const failures: string[] = [];
let cpuMs = 0;
let gpuMs = 0;

for (const group of fixtureGroups()) {
	// fresh instances per fixture folder, like the suites: memos and layout
	// latches never carry from one detector's cases into another's
	const cpuDetectors = createAllDetectors(resources);
	const gpuDetectors = createAllDetectors(resources);
	for (const path of group) {
		const src = toMat(await readImage(path));
		const frame = normalizeFrame(src);
		const scaled = await scaler.normalize(src);
		if (!samePixels(frame, scaled)) {
			pixelMismatchFrames++;
			failures.push(`${path}: GPU upscale differs from normalizeFrame`);
		}
		scaled.delete();
		if (!(await sameDownscale(src))) {
			pixelMismatchFrames++;
			failures.push(`${path}: GPU 2160p downscale differs from normalizeFrame`);
		}
		src.delete();
		for (const [i, cpuDetector] of cpuDetectors.entries()) {
			const gpuDetector = gpuDetectors[i]!;
			const gate = cpuDetector.gate(frame);
			gpuDetector.gate(frame);
			rows++;
			if (!gate.pass) {
				identicalRows++;
				decisionRows++;
				continue;
			}
			let start = performance.now();
			const cpuEvents = cpuDetector.parse(frame, 0, gate);
			cpuMs += performance.now() - start;
			start = performance.now();
			const gpuEvents = await matcher.run(
				gpuDetector.parseSteps(frame, 0, gate, true),
			);
			gpuMs += performance.now() - start;
			if (decisions(cpuEvents) === decisions(gpuEvents)) decisionRows++;
			if (JSON.stringify(cpuEvents) === JSON.stringify(gpuEvents)) {
				identicalRows++;
			} else {
				failures.push(`${path} ${cpuDetector.id}: events differ`);
				if (verbose) {
					console.log("CPU", JSON.stringify(cpuEvents));
					console.log("GPU", JSON.stringify(gpuEvents));
				}
			}
		}
		frame.delete();
	}
}

for (const failure of failures) console.log(failure);
console.log(
	`${rows} detector × frame rows: ${identicalRows} byte-identical, ${decisionRows} with identical decisions; ${pixelMismatchFrames} frames with resize mismatches`,
);
console.log(
	`parse time: CPU ${(cpuMs / 1000).toFixed(1)} s, GPU ${(gpuMs / 1000).toFixed(1)} s · ${JSON.stringify(matcher.stats)}`,
);
matcher.destroy();
process.exit(failures.length === 0 ? 0 : 1);

/** Fixture frames grouped by detector folder, in a stable order. */
function fixtureGroups(): string[][] {
	return readdirSync(FIXTURES_DIR)
		.filter((dir) => statSync(join(FIXTURES_DIR, dir)).isDirectory())
		.sort()
		.map((dir) =>
			readdirSync(join(FIXTURES_DIR, dir))
				.sort()
				.flatMap((fixture) =>
					["frame.png", "frame.webp", "frame.jpg", "frame.jpeg"]
						.map((name) => join(FIXTURES_DIR, dir, fixture, name))
						.filter((path) => {
							try {
								return statSync(path).isFile();
							} catch {
								return false;
							}
						})
						.slice(0, 1),
				),
		);
}

function decisions(events: unknown): string {
	return JSON.stringify(events, (key, value) =>
		SCORE_FIELDS.has(key) ? undefined : value,
	);
}

function samePixels(a: Mat, b: Mat): boolean {
	const x = a.data as Uint8Array;
	const y = b.data as Uint8Array;
	if (x.length !== y.length) return false;
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
	return true;
}

/** The readback's 2160p path on `frame` upscaled to 2160p: same bars and, without bars, same pixels as normalizeFrame. */
async function sameDownscale(frame: Mat): Promise<boolean> {
	const cv = getCV();
	const src = new cv.Mat();
	cv.resize(frame, src, new cv.Size(3840, 2160), 0, 0, cv.INTER_CUBIC);
	try {
		const device = matcher.device;
		const data = src.data as Uint8Array;
		const buffer = device.createBuffer({
			size: data.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		device.queue.writeBuffer(buffer, 0, data);
		const encoder = device.createCommandEncoder();
		const { read } = downscaler.encode(encoder, buffer, src.cols);
		const lines = lineSums.encode(encoder, buffer, {
			stride: src.cols,
			w: src.cols,
			h: src.rows,
		});
		device.queue.submit([encoder.finish()]);
		const [, sums] = await Promise.all([
			read.mapAsync(GPUMapMode.READ),
			lines.read(),
		]);
		const pixels = new Uint8Array(read.getMappedRange().slice(0));
		read.unmap();
		downscaler.release(read);
		buffer.destroy();
		const box = detectContentBox(src.cols, src.rows, data);
		const gpuBox = detectContentBoxFromSums(src.cols, src.rows, sums);
		if (JSON.stringify(box) !== JSON.stringify(gpuBox)) return false;
		if (box) return true;
		const expected = normalizeFrame(src);
		const cpu = expected.data as Uint8Array;
		const same =
			cpu.length === pixels.length && cpu.every((v, i) => v === pixels[i]);
		expected.delete();
		return same;
	} finally {
		src.delete();
	}
}
