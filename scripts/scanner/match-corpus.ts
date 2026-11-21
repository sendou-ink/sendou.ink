/**
 * Match-request corpora for the GPU matcher's replay benchmark: every run's
 * steps (requests with image bytes, template bytes, windows, keys), recorded
 * from a real scan (scan-vod --record) and replayed by gpu-replay.ts. On disk:
 * <dir>/index.json (runs, blob table) + <dir>/data.bin (pixels, deduped by
 * content).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { StepsRunner } from "../../app/features/scanner/core/detectors/frame-pass";
import type { Image } from "../../app/features/scanner/core/image";
import type {
	MatchScores,
	MatchSteps,
} from "../../app/features/scanner/core/match-steps";

export interface CorpusRequest {
	image: number;
	templates: number[];
	windows?: [number, number][];
	key?: string;
}

export interface MatchCorpus {
	images: Image[];
	runs: { steps: CorpusRequest[][] }[];
}

interface BlobMeta {
	rows: number;
	cols: number;
	ch: number;
	off: number;
}

/** Wraps `inner` so every run it answers is recorded; `save` writes the corpus to `dir`. */
export function recordingRunner(inner: StepsRunner, dir: string) {
	const blobs: BlobMeta[] = [];
	const chunks: Uint8Array[] = [];
	let dataLength = 0;
	const byHash = new Map<string, number>();
	const templateIds = new Map<Image, number>();
	const runs: MatchCorpus["runs"] = [];

	const blobOf = (image: Image): number => {
		const { data } = image;
		const meta = { rows: image.rows, cols: image.cols, ch: image.channels };
		const hash = createHash("sha1")
			.update(`${meta.rows}x${meta.cols}x${meta.ch}`)
			.update(data)
			.digest("hex");
		const known = byHash.get(hash);
		if (known !== undefined) return known;
		blobs.push({ ...meta, off: dataLength });
		chunks.push(data.slice());
		dataLength += data.length;
		byHash.set(hash, blobs.length - 1);
		return blobs.length - 1;
	};
	const templateOf = (image: Image) => {
		let id = templateIds.get(image);
		if (id === undefined) {
			id = blobOf(image);
			templateIds.set(image, id);
		}
		return id;
	};

	function* recorded<T>(steps: MatchSteps<T>): MatchSteps<T> {
		const run: MatchCorpus["runs"][number] = { steps: [] };
		runs.push(run);
		let scores: MatchScores[] | undefined;
		while (true) {
			const step = scores === undefined ? steps.next() : steps.next(scores);
			if (step.done) return step.value;
			run.steps.push(
				step.value.map((request) => ({
					image: blobOf(request.image),
					templates: request.templates.map(templateOf),
					windows: request.windows?.map(([lo, hi]) => [lo, hi]),
					key: request.key,
				})),
			);
			scores = yield step.value;
		}
	}

	return {
		run: (<T>(steps: MatchSteps<T>) => inner(recorded(steps))) as StepsRunner,
		save(): string {
			mkdirSync(dir, { recursive: true });
			const data = new Uint8Array(dataLength);
			let off = 0;
			for (const chunk of chunks) {
				data.set(chunk, off);
				off += chunk.length;
			}
			writeFileSync(`${dir}/data.bin`, data);
			writeFileSync(`${dir}/index.json`, JSON.stringify({ blobs, runs }));
			const requests = runs.reduce(
				(n, r) => n + r.steps.reduce((m, s) => m + s.length, 0),
				0,
			);
			return `recorded ${runs.length} runs, ${requests} requests, ${blobs.length} images (${(dataLength / 1e6).toFixed(1)} MB) to ${dir}`;
		},
	};
}

export function loadMatchCorpus(dir: string): MatchCorpus {
	const index = JSON.parse(readFileSync(`${dir}/index.json`, "utf8")) as {
		blobs: BlobMeta[];
		runs: MatchCorpus["runs"];
	};
	// shared, so worker threads receive the pixels without a copy each
	const file = readFileSync(`${dir}/data.bin`);
	const data = new Uint8Array(new SharedArrayBuffer(file.length));
	data.set(file);
	return {
		images: index.blobs.map(({ rows, cols, ch, off }) => ({
			rows,
			cols,
			channels: ch,
			data: data.subarray(off, off + rows * cols * ch),
		})),
		runs: index.runs,
	};
}
