/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * ROI calibration helper: normalize a frame to 1080p, then dump crops
 * (optionally scaled up) and/or a grid overlay for visual inspection.
 *
 * Usage:
 *   vite-node -c scripts/scanner/vite-node.config.ts scripts/scanner/dump-crops.ts <image> <outdir> grid
 *   vite-node -c scripts/scanner/vite-node.config.ts scripts/scanner/dump-crops.ts <image> <outdir> x,y,w,h[,scale][:label] ...
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadOpenCV } from "../../app/features/scanner/core/cv";
import {
	cropRoi,
	matToFrameData,
	normalizeFrame,
	toMat,
} from "../../app/features/scanner/core/image";
import { readImage, writePng } from "../../app/features/scanner/node/image-io";

const [imagePath, outDir, ...specs] = process.argv.slice(2);
if (!imagePath || !outDir || specs.length === 0) {
	console.error(
		"usage: vite-node -c scripts/scanner/vite-node.config.ts scripts/scanner/dump-crops.ts <image> <outdir> (grid | x,y,w,h[,scale][:label])...",
	);
	process.exit(1);
}

const cv = await loadOpenCV();
mkdirSync(outDir, { recursive: true });

const src = toMat(await readImage(imagePath));
const frame = normalizeFrame(src);
src.delete();

for (const spec of specs) {
	if (spec === "grid") {
		const overlay = frame.clone();
		for (let x = 0; x < overlay.cols; x += 20) {
			const major = x % 100 === 0;
			cv.line(
				overlay,
				new cv.Point(x, 0),
				new cv.Point(x, overlay.rows),
				new cv.Scalar(255, 0, major ? 0 : 255, 255),
				major ? 2 : 1,
			);
		}
		for (let y = 0; y < overlay.rows; y += 20) {
			const major = y % 100 === 0;
			cv.line(
				overlay,
				new cv.Point(0, y),
				new cv.Point(overlay.cols, y),
				new cv.Scalar(255, 0, major ? 0 : 255, 255),
				major ? 2 : 1,
			);
		}
		writePng(join(outDir, "grid.png"), matToFrameData(overlay));
		overlay.delete();
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
	const out = new cv.Mat();
	cv.resize(
		crop,
		out,
		new cv.Size(0, 0),
		Number(scale),
		Number(scale),
		cv.INTER_NEAREST,
	);
	const name = label ?? `crop-${x}-${y}-${w}x${h}`;
	writePng(join(outDir, `${name}.png`), matToFrameData(out));
	crop.delete();
	out.delete();
}

frame.delete();
console.info(`wrote crops to ${outDir}`);
