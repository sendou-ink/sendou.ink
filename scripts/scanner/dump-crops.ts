/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * ROI calibration helper: normalize a frame to 1080p, then dump crops
 * (optionally scaled up) and/or a grid overlay for visual inspection.
 *
 * Usage:
 *   pnpm exec vite-node scripts/scanner/dump-crops.ts <image> <outdir> grid
 *   pnpm exec vite-node scripts/scanner/dump-crops.ts <image> <outdir> x,y,w,h[,scale][:label] ...
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
	cropRoi,
	type Image,
	imageFromFrameData,
	imageToFrameData,
	normalizeFrame,
} from "../../app/features/scanner/core/image";
import { resizeBy } from "../../app/features/scanner/core/resize";
import { readImage, writePng } from "../../app/features/scanner/node/image-io";

const [imagePath, outDir, ...specs] = process.argv.slice(2);
if (!imagePath || !outDir || specs.length === 0) {
	console.error(
		"usage: pnpm exec vite-node scripts/scanner/dump-crops.ts <image> <outdir> (grid | x,y,w,h[,scale][:label])...",
	);
	process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const src = imageFromFrameData(await readImage(imagePath));
const frame = normalizeFrame(src);

for (const spec of specs) {
	if (spec === "grid") {
		const overlay = { ...frame, data: frame.data.slice() };
		for (let y = 0; y < overlay.rows; y++) {
			for (let x = 0; x < overlay.cols; x++) {
				// every 100 px a 2 px red line, every 20 px a magenta one
				if (x % 100 < 2 || y % 100 < 2) {
					setPixel(overlay, x, y, [255, 0, 0]);
				} else if (x % 20 === 0 || y % 20 === 0) {
					setPixel(overlay, x, y, [255, 0, 255]);
				}
			}
		}
		writePng(join(outDir, "grid.png"), imageToFrameData(overlay));
		continue;
	}
	const [rect = "", label] = spec.split(":");
	const [x, y, w, h, scale = 1] = rect.split(",").map(Number);
	if ([x, y, w, h].some((v) => !Number.isFinite(v))) {
		console.error(`bad spec: ${spec}`);
		continue;
	}
	const cx = Math.max(0, Math.min(x!, frame.cols - 1));
	const cy = Math.max(0, Math.min(y!, frame.rows - 1));
	const crop = cropRoi(frame, {
		x: cx,
		y: cy,
		w: Math.min(w!, frame.cols - cx),
		h: Math.min(h!, frame.rows - cy),
	});
	const out = resizeBy(crop, Number(scale), Number(scale), "nearest");
	const name = label ?? `crop-${x}-${y}-${w}x${h}`;
	writePng(join(outDir, `${name}.png`), imageToFrameData(out));
}

console.info(`wrote crops to ${outDir}`);

function setPixel(
	image: Image,
	x: number,
	y: number,
	[r, g, b]: [number, number, number],
) {
	image.data.set([r, g, b], (y * image.cols + x) * image.channels);
}
