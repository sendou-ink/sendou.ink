/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Replay benchmark for the GPU matcher: replays a recorded match-request
 * corpus (scan-vod --record) through worker/gpu-matcher.ts, times it, and
 * checks every score of a sample of runs bit-for-bit against an exact JS
 * reference (integer sums, one f64 normalization with OpenCV's guards, f32
 * result). Any kernel change must keep 0 mismatches. WebGPU comes from Dawn
 * (node/webgpu.ts: WEBGPU_NODE).
 *
 * Usage: pnpm scanner:gpu-replay <corpus-dir> [--check-every N] [--threads T] [--cpu]
 * --check-every: exact-check every N-th run (default 1 = all; the reference is slow)
 * --cpu: also run the CPU driver (runSync) on the same corpus: timed, and every
 *   score compared with the GPU's
 */
import { cpus } from "node:os";
import { Worker } from "node:worker_threads";
import {
	getCV,
	loadOpenCV,
	type Mat,
} from "../../app/features/scanner/core/cv";
import {
	type MatchRequest,
	type MatchSteps,
	runSync,
} from "../../app/features/scanner/core/match-steps";
import { nodeGpu } from "../../app/features/scanner/node/webgpu";
import { createGpuMatcher } from "../../app/features/scanner/worker/gpu-matcher";
import { type CorpusRequest, loadMatchCorpus } from "./match-corpus";

const EXACT_WORKER = /* js */ `
const { parentPort, workerData } = require("node:worker_threads");
const { images } = workerData;
const stats = new Map();
function templateStats(id) {
	let s = stats.get(id);
	if (s) return s;
	const t = images[id];
	const n = t.rows * t.cols;
	const sum = new Array(t.ch).fill(0);
	const sq = new Array(t.ch).fill(0);
	for (let i = 0; i < n; i++) for (let c = 0; c < t.ch; c++) {
		const v = t.data[i * t.ch + c];
		sum[c] += v;
		sq[c] += v * v;
	}
	let varInt = 0;
	for (let c = 0; c < t.ch; c++) varInt += n * sq[c] - sum[c] * sum[c];
	s = { n, sum, varInt };
	stats.set(id, s);
	return s;
}
function normalize(num, wvar, tvar) {
	if (tvar === 0) return 1;
	if (wvar <= 0) return 0;
	const r = num / (Math.sqrt(wvar) * Math.sqrt(tvar));
	const a = Math.abs(r);
	if (a < 1) return Math.fround(r);
	if (a < 1.125) return r > 0 ? 1 : -1;
	return 0;
}
function windowMax(img, t, s, lo, hi) {
	const ch = img.ch;
	const rowLen = t.cols * ch;
	let best = -Infinity;
	for (let y = 0; y + t.rows <= img.rows; y++) {
		for (let x = lo; x <= hi; x++) {
			let num = 0;
			let wvar = 0;
			for (let c = 0; c < ch; c++) {
				let S = 0, Q = 0, P = 0;
				for (let ty = 0; ty < t.rows; ty++) {
					const ib = ((y + ty) * img.cols + x) * ch + c;
					const tb = ty * rowLen + c;
					for (let k = 0; k < rowLen; k += ch) {
						const iv = img.data[ib + k];
						S += iv;
						Q += iv * iv;
						P += iv * t.data[tb + k];
					}
				}
				num += s.n * P - S * s.sum[c];
				wvar += s.n * Q - S * S;
			}
			const v = normalize(num, wvar, s.varInt);
			if (v > best) best = v;
		}
	}
	return best;
}
parentPort.on("message", ({ run, steps }) => {
	const out = [];
	for (const step of steps) for (const r of step) {
		const img = images[r.image];
		for (const [k, id] of r.templates.entries()) {
			const t = images[id];
			const [lo, hi] = r.windows?.[k] ?? [0, img.cols - t.cols];
			out.push(windowMax(img, t, templateStats(id), lo, hi));
		}
	}
	parentPort.postMessage({ run, scores: Float32Array.from(out) });
});
`;

const options = parseArgs(process.argv.slice(2));
if (!options) {
	console.error(
		"usage: pnpm scanner:gpu-replay <corpus-dir> [--check-every N] [--threads T] [--cpu]",
	);
	process.exit(1);
}

await loadOpenCV();
const cv = getCV();
const corpus = loadMatchCorpus(options.dir);
const mats = new Map<number, Mat>();
const matOf = (id: number): Mat => {
	let mat = mats.get(id);
	if (!mat) {
		const image = corpus.images[id]!;
		mat = new cv.Mat(
			image.rows,
			image.cols,
			image.ch === 1 ? cv.CV_8UC1 : cv.CV_8UC3,
		);
		mat.data.set(image.data);
		mats.set(id, mat);
	}
	return mat;
};

const matcher = await createGpuMatcher(nodeGpu(), { timestamps: true });
// warm-up (pipeline compilation, template upload), then a clean timed pass
await matcher.run(replay(0, []));
for (const key of Object.keys(
	matcher.stats,
) as (keyof typeof matcher.stats)[]) {
	matcher.stats[key] = 0;
}
const gpuScores: number[][] = [];
const gpuStart = performance.now();
for (let run = 0; run < corpus.runs.length; run++) {
	const scores: number[] = [];
	await matcher.run(replay(run, scores));
	gpuScores.push(scores);
}
const gpuMs = performance.now() - gpuStart;
const requests = corpus.runs.reduce(
	(n, r) => n + r.steps.reduce((m, s) => m + s.length, 0),
	0,
);
console.log(
	`GPU: ${gpuMs.toFixed(0)} ms for ${corpus.runs.length} runs (${requests} requests)`,
);
console.log(JSON.stringify(matcher.stats));

if (options.cpu) {
	// the CPU driver scores exactly too: every score must match the GPU's bit for bit
	const cpuStart = performance.now();
	let cpuMismatches = 0;
	for (let run = 0; run < corpus.runs.length; run++) {
		const scores: number[] = [];
		runSync(replay(run, scores));
		for (const [i, score] of scores.entries()) {
			if (!Object.is(score, gpuScores[run]![i])) cpuMismatches++;
		}
	}
	console.log(
		`CPU (runSync): ${(performance.now() - cpuStart).toFixed(0)} ms, ${cpuMismatches} scores differing from the GPU's`,
	);
}

const checked = corpus.runs
	.map((_, run) => run)
	.filter((run) => run % options.checkEvery === 0);
const exact = await exactScores(checked);
let compared = 0;
let mismatches = 0;
for (const [run, reference] of exact) {
	const scores = gpuScores[run]!;
	for (let i = 0; i < reference.length; i++) {
		compared++;
		if (!Object.is(Math.fround(scores[i]!), reference[i]!)) {
			mismatches++;
			if (mismatches <= 5)
				console.log(
					`mismatch run ${run} #${i}: GPU ${scores[i]} exact ${reference[i]}`,
				);
		}
	}
}
console.log(
	`exact check: ${checked.length}/${corpus.runs.length} runs, ${compared} scores, ${mismatches} mismatches`,
);
matcher.destroy();
process.exit(mismatches === 0 ? 0 : 1);

function* replay(run: number, out: number[]): MatchSteps<void> {
	for (const step of corpus.runs[run]!.steps) {
		const batch: MatchRequest[] = step.map((r) => ({
			image: matOf(r.image),
			templates: r.templates.map(matOf),
			windows: r.windows,
			key: r.key,
		}));
		const scores = yield batch;
		for (const [i, r] of step.entries()) {
			for (let k = 0; k < r.templates.length; k++) out.push(scores[i]!(k));
		}
	}
}

async function exactScores(runs: number[]): Promise<Map<number, Float32Array>> {
	const results = new Map<number, Float32Array>();
	const queue = [...runs];
	const workers = Array.from(
		{ length: Math.min(options!.threads, runs.length) },
		() =>
			new Worker(EXACT_WORKER, {
				eval: true,
				workerData: { images: corpus.images },
			}),
	);
	await Promise.all(
		workers.map(
			(worker) =>
				new Promise<void>((resolve, reject) => {
					const next = () => {
						const run = queue.shift();
						if (run === undefined) {
							void worker.terminate();
							resolve();
							return;
						}
						worker.postMessage({
							run,
							steps: corpus.runs[run]!.steps as CorpusRequest[][],
						});
					};
					worker.on("message", ({ run, scores }) => {
						results.set(run, scores);
						next();
					});
					worker.on("error", reject);
					next();
				}),
		),
	);
	return results;
}

function parseArgs(argv: string[]) {
	let dir: string | undefined;
	let checkEvery = 1;
	let threads = Math.max(1, cpus().length - 2);
	let cpu = false;
	// biome-ignore lint/style/useForOf: the index advances inside the loop to consume flag values
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]!;
		if (arg === "--check-every") checkEvery = Number(argv[++i]);
		else if (arg === "--threads") threads = Number(argv[++i]);
		else if (arg === "--cpu") cpu = true;
		else if (!arg.startsWith("--") && dir === undefined) dir = arg;
		else return null;
	}
	if (!dir || !(checkEvery >= 1) || !(threads >= 1)) return null;
	return { dir, checkEvery, threads, cpu };
}
