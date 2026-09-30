/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// Splits sub & special weapon icons into the layers that let them take the
// user's accent color as their ink color, writing them into the assets repo,
// see docs/dev/how-to.md
//
// The source icons are painted in exactly three tones (ink purple, teal,
// white), variants can add a color of their own (the coral of Big Bubbler's
// weak points), so each one becomes:
//
//   detail    the tones other than ink and white, keeping their color, as an
//             overlay
//   highlight the white tone as a mask, so the app can paint it on top of the
//             recolored ink without a seam
//
// The ink tone needs no file of its own: the app fills the source icon's own
// alpha channel with the accent color and lays these two on top. See
// app/components/Image.tsx.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { range } from "remeda";
import sharp from "sharp";

const DEFAULT_ASSETS_IMG_DIR = fileURLToPath(
	new URL("../../assets/assets/img", import.meta.url),
);

const SUB_WEAPON_ID_COUNT = 14;
const SPECIAL_WEAPON_ID_COUNT = 19;

/** The three tones every sub & special weapon icon is painted in. */
const INK = [65, 59, 185];
const TEAL = [53, 191, 193];
const WHITE = [255, 255, 255];
const CORAL = [234, 112, 108];

/** How much of a detail tone a pixel has to be to vouch for the same tone around it, see `clearStrayDetail`. */
const DETAIL_SEED_WEIGHT = 0.7;
const DETAIL_SEED_MIN_ALPHA = 0.5;

/** 4:4:4 because the chroma subsampling of the source icons is what smears the tone boundaries in the first place. */
const AVIF_OPTIONS = {
	quality: 90,
	effort: 6,
	chromaSubsampling: "4:4:4",
} as const;

const GROUPS = [
	{
		name: "sub-weapons",
		files: range(0, SUB_WEAPON_ID_COUNT).map(String),
		detailTones: [TEAL],
	},
	{
		name: "special-weapons",
		files: range(1, SPECIAL_WEAPON_ID_COUNT + 1).map(String),
		detailTones: [TEAL],
	},
	{
		name: "special-weapons",
		subDir: "variants",
		files: ["2-weakpoints"],
		detailTones: [TEAL, CORAL],
	},
];

async function main() {
	const imgDir = path.resolve(process.argv[2] ?? DEFAULT_ASSETS_IMG_DIR);

	for (const group of GROUPS) {
		const subDir = group.subDir ?? "";
		const dirs = {
			detail: path.join(imgDir, `${group.name}-detail`, subDir),
			highlight: path.join(imgDir, `${group.name}-highlight`, subDir),
		};
		for (const dir of Object.values(dirs)) {
			await fs.mkdir(dir, { recursive: true });
		}

		for (const file of group.files) {
			const source = await fs.readFile(
				path.join(imgDir, group.name, subDir, `${file}.avif`),
			);
			const layers = await toInkLayers(source, group.detailTones);

			await fs.writeFile(path.join(dirs.detail, `${file}.avif`), layers.detail);
			await fs.writeFile(
				path.join(dirs.highlight, `${file}.avif`),
				layers.highlight,
			);
		}

		console.log(
			`${path.join(group.name, subDir)}: wrote ${group.files.length} icons`,
		);
	}

	console.log(`\nOutput in ${imgDir}, commit & push it in the assets repo.`);
}

async function toInkLayers(source: Buffer, detailTones: number[][]) {
	const { data, info } = await sharp(source)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const tones = [INK, WHITE, ...detailTones];
	const pixelCount = info.width * info.height;
	const alphas = new Float32Array(pixelCount);
	const whiteWeights = new Float32Array(pixelCount);
	const detailWeights = detailTones.map(() => new Float32Array(pixelCount));

	for (let p = 0; p < pixelCount; p++) {
		const i = p * 4;
		alphas[p] = data[i + 3] / 255;
		if (alphas[p] === 0) continue;

		const [, white, ...details] = toneWeightsOf(
			[data[i], data[i + 1], data[i + 2]],
			tones,
		);
		whiteWeights[p] = white;
		for (const [t, weight] of details.entries()) {
			detailWeights[t][p] = weight;
		}
	}

	for (const weights of detailWeights) {
		clearStrayDetail({
			weights,
			alphas,
			width: info.width,
			height: info.height,
		});
	}

	const detail = Buffer.alloc(data.length);
	const highlight = Buffer.alloc(data.length);
	for (let p = 0; p < pixelCount; p++) {
		const i = p * 4;
		const alpha = alphas[p];
		if (alpha === 0) continue;

		// the layers stack detail over ink and highlight over detail, so each one
		// only has to cover what the layers under it still show through
		const highlightAlpha = alpha * whiteWeights[p];
		const covered = 1 - highlightAlpha;
		const detailWeight = detailWeights.reduce((sum, w) => sum + w[p], 0);
		const detailAlpha = covered === 0 ? 0 : (alpha * detailWeight) / covered;

		for (const channel of [0, 1, 2]) {
			detail[i + channel] =
				detailWeight === 0
					? detailTones[0][channel]
					: detailTones.reduce(
							(sum, tone, t) => sum + tone[channel] * detailWeights[t][p],
							0,
						) / detailWeight;
			highlight[i + channel] = WHITE[channel];
		}
		detail[i + 3] = toByte(detailAlpha);
		highlight[i + 3] = toByte(highlightAlpha);
	}

	const toAvif = (buffer: Buffer) =>
		sharp(buffer, {
			raw: { width: info.width, height: info.height, channels: 4 },
		})
			.avif(AVIF_OPTIONS)
			.toBuffer();

	return { detail: await toAvif(detail), highlight: await toAvif(highlight) };
}

/**
 * Zeroes coverage of a detail tone no region of it can account for. A pixel is
 * only part teal (say) because a teal region overlaps it, so it has to touch a
 * pixel that is confidently teal. Anything else is the lossy source's chroma
 * noise read as a trace of the tone, which would speckle the recolored icon.
 */
function clearStrayDetail({
	weights,
	alphas,
	width,
	height,
}: {
	weights: Float32Array;
	alphas: Float32Array;
	width: number;
	height: number;
}) {
	const nearSeed = new Uint8Array(weights.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const p = y * width + x;
			if (
				weights[p] < DETAIL_SEED_WEIGHT ||
				alphas[p] < DETAIL_SEED_MIN_ALPHA
			) {
				continue;
			}

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const ny = y + dy;
					const nx = x + dx;
					if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
					nearSeed[ny * width + nx] = 1;
				}
			}
		}
	}

	for (let p = 0; p < weights.length; p++) {
		if (!nearSeed[p]) weights[p] = 0;
	}
}

function toByte(value: number) {
	return Math.round(Math.max(0, Math.min(1, value)) * 255);
}

/**
 * How much of each tone a pixel is made of. A pixel sits inside one flat region
 * or on the boundary between two, so the best explanation is a blend of exactly
 * two tones. Fitting all three at once instead lets the lossy source's chroma
 * noise turn an ink/white edge into teal.
 */
function toneWeightsOf(color: number[], tones: number[][]) {
	const dot = (a: number[], b: number[]) =>
		a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

	let best = { from: 0, to: 0, blend: 0, residual: Number.POSITIVE_INFINITY };
	for (const [from, to] of tonePairs(tones.length)) {
		const toward = tones[to].map((c, i) => c - tones[from][i]);
		const offset = color.map((c, i) => c - tones[from][i]);
		const blend = Math.max(
			0,
			Math.min(1, dot(offset, toward) / dot(toward, toward)),
		);
		const residual = Math.hypot(
			...color.map((c, i) => c - (tones[from][i] + blend * toward[i])),
		);

		if (residual < best.residual) best = { from, to, blend, residual };
	}

	const weights = tones.map(() => 0);
	weights[best.from] = 1 - best.blend;
	weights[best.to] = best.blend;

	return weights;
}

function tonePairs(toneCount: number) {
	return range(0, toneCount).flatMap((from) =>
		range(from + 1, toneCount).map((to) => [from, to] as const),
	);
}

await main();
