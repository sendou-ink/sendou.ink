/** biome-ignore-all lint/suspicious/noConsole: CLI script output */

// Splits sub & special weapon icons into the layers that let them take the
// user's accent color as their ink color, writing them into the assets repo,
// see docs/dev/how-to.md
//
// The source icons are painted in exactly three tones (ink purple, teal,
// white), so each one becomes:
//
//   detail    the teal tone, keeping its color, as an overlay
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
const TONES = [INK, TEAL, WHITE];
const TONE_PAIRS = [
	[0, 1],
	[0, 2],
	[1, 2],
];

/** How teal a pixel has to be to vouch for the teal around it, see `clearStrayTeal`. */
const TEAL_SEED_WEIGHT = 0.7;
const TEAL_SEED_MIN_ALPHA = 0.5;

/** 4:4:4 because the chroma subsampling of the source icons is what smears the tone boundaries in the first place. */
const AVIF_OPTIONS = {
	quality: 90,
	effort: 6,
	chromaSubsampling: "4:4:4",
} as const;

const GROUPS = [
	{
		name: "sub-weapons",
		ids: range(0, SUB_WEAPON_ID_COUNT),
	},
	{
		name: "special-weapons",
		ids: range(1, SPECIAL_WEAPON_ID_COUNT + 1),
	},
];

async function main() {
	const imgDir = path.resolve(process.argv[2] ?? DEFAULT_ASSETS_IMG_DIR);

	for (const group of GROUPS) {
		const dirs = {
			detail: path.join(imgDir, `${group.name}-detail`),
			highlight: path.join(imgDir, `${group.name}-highlight`),
		};
		for (const dir of Object.values(dirs)) {
			await fs.mkdir(dir, { recursive: true });
		}

		for (const id of group.ids) {
			const source = await fs.readFile(
				path.join(imgDir, group.name, `${id}.avif`),
			);
			const layers = await toInkLayers(source);

			await fs.writeFile(path.join(dirs.detail, `${id}.avif`), layers.detail);
			await fs.writeFile(
				path.join(dirs.highlight, `${id}.avif`),
				layers.highlight,
			);
		}

		console.log(`${group.name}: wrote ${group.ids.length} icons`);
	}

	console.log(`\nOutput in ${imgDir}, commit & push it in the assets repo.`);
}

async function toInkLayers(source: Buffer) {
	const { data, info } = await sharp(source)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	const pixelCount = info.width * info.height;
	const alphas = new Float32Array(pixelCount);
	const tealWeights = new Float32Array(pixelCount);
	const whiteWeights = new Float32Array(pixelCount);

	for (let p = 0; p < pixelCount; p++) {
		const i = p * 4;
		alphas[p] = data[i + 3] / 255;
		if (alphas[p] === 0) continue;

		const [, teal, white] = toneWeightsOf([data[i], data[i + 1], data[i + 2]]);
		tealWeights[p] = teal;
		whiteWeights[p] = white;
	}

	clearStrayTeal({
		tealWeights,
		alphas,
		width: info.width,
		height: info.height,
	});

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
		const detailAlpha = covered === 0 ? 0 : (alpha * tealWeights[p]) / covered;

		for (const channel of [0, 1, 2]) {
			detail[i + channel] = TEAL[channel];
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
 * Zeroes teal coverage no teal region can account for. A pixel is only part
 * teal because a teal region overlaps it, so it has to touch a pixel that is
 * confidently teal. Anything else is the lossy source's chroma noise read as a
 * trace of teal, which would speckle the recolored icon.
 */
function clearStrayTeal({
	tealWeights,
	alphas,
	width,
	height,
}: {
	tealWeights: Float32Array;
	alphas: Float32Array;
	width: number;
	height: number;
}) {
	const nearTeal = new Uint8Array(tealWeights.length);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const p = y * width + x;
			if (
				tealWeights[p] < TEAL_SEED_WEIGHT ||
				alphas[p] < TEAL_SEED_MIN_ALPHA
			) {
				continue;
			}

			for (let dy = -1; dy <= 1; dy++) {
				for (let dx = -1; dx <= 1; dx++) {
					const ny = y + dy;
					const nx = x + dx;
					if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
					nearTeal[ny * width + nx] = 1;
				}
			}
		}
	}

	for (let p = 0; p < tealWeights.length; p++) {
		if (!nearTeal[p]) tealWeights[p] = 0;
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
function toneWeightsOf(color: number[]) {
	const dot = (a: number[], b: number[]) =>
		a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

	let best = { from: 0, to: 0, blend: 0, residual: Number.POSITIVE_INFINITY };
	for (const [from, to] of TONE_PAIRS) {
		const toward = TONES[to].map((c, i) => c - TONES[from][i]);
		const offset = color.map((c, i) => c - TONES[from][i]);
		const blend = Math.max(
			0,
			Math.min(1, dot(offset, toward) / dot(toward, toward)),
		);
		const residual = Math.hypot(
			...color.map((c, i) => c - (TONES[from][i] + blend * toward[i])),
		);

		if (residual < best.residual) best = { from, to, blend, residual };
	}

	const weights = [0, 0, 0];
	weights[best.from] = 1 - best.blend;
	weights[best.to] = best.blend;

	return weights;
}

await main();
