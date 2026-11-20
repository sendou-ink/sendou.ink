/**
 * Neighborhood operations on single-channel 8-bit images, each giving
 * OpenCV's output bit for bit: the 3x3 Laplacian, the 5x5 Gaussian blur,
 * dilation, min-max normalization and connected components.
 */
import { createImage, type Image } from "./image";
import { roundHalfEven } from "./resize";

/** A structuring element of odd size anchored at its center: per row, the half width of the run it covers there (null: none). */
interface StructuringElement {
	halfWidths: (number | null)[];
}

interface ComponentStats {
	left: number;
	top: number;
	width: number;
	height: number;
	/** pixel count */
	area: number;
}

interface ConnectedComponents {
	/** components including the background (label 0) */
	count: number;
	/** label per pixel */
	labels: Int32Array;
	/** per label; the background's box is the whole image */
	stats: ComponentStats[];
}

const f = Math.fround;

/** |Laplacian| (3x3 aperture, reflect-101 borders) saturated to 8 bits. */
export function laplacianAbs(gray: Image): Image {
	const { rows, cols, data } = gray;
	const out = createImage(rows, cols, 1);
	for (let y = 0; y < rows; y++) {
		const up = reflect101(y - 1, rows) * cols;
		const row = y * cols;
		const down = reflect101(y + 1, rows) * cols;
		for (let x = 0; x < cols; x++) {
			const left = reflect101(x - 1, cols);
			const right = reflect101(x + 1, cols);
			const v =
				2 *
					(data[up + left]! +
						data[up + right]! +
						data[down + left]! +
						data[down + right]!) -
				8 * data[row + x]!;
			out.data[row + x] = Math.min(255, Math.abs(v));
		}
	}
	return out;
}

/** GaussianBlur with a 5x5 kernel and sigma 0 (weights 1 4 6 4 1, reflect-101 borders). */
export function gaussianBlur5(gray: Image): Image {
	const weights = [1, 4, 6, 4, 1];
	const { rows, cols, data } = gray;
	const horizontal = new Int32Array(rows * cols);
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			let sum = 0;
			for (let k = 0; k < 5; k++) {
				sum += weights[k]! * data[y * cols + reflect101(x + k - 2, cols)]!;
			}
			horizontal[y * cols + x] = sum;
		}
	}
	const out = createImage(rows, cols, 1);
	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			let sum = 0;
			for (let k = 0; k < 5; k++) {
				sum +=
					weights[k]! * horizontal[reflect101(y + k - 2, rows) * cols + x]!;
			}
			out.data[y * cols + x] = (sum + 128) >> 8;
		}
	}
	return out;
}

/** getStructuringElement(MORPH_RECT, cols x rows), odd sizes */
export function rectElement(cols: number, rows: number): StructuringElement {
	return { halfWidths: new Array(rows).fill(Math.floor(cols / 2)) };
}

/** getStructuringElement(MORPH_ELLIPSE, cols x rows), odd sizes */
export function ellipseElement(cols: number, rows: number): StructuringElement {
	const r = Math.floor(rows / 2);
	const c = Math.floor(cols / 2);
	const invR2 = r ? 1 / (r * r) : 0;
	const halfWidths: (number | null)[] = [];
	for (let i = 0; i < rows; i++) {
		const dy = i - r;
		halfWidths.push(
			Math.abs(dy) > r
				? null
				: roundHalfEven(c * Math.sqrt((r * r - dy * dy) * invR2)),
		);
	}
	return { halfWidths };
}

/** dilate with the element anchored at its center; pixels past the edge count as 0. */
export function dilate(
	src: Image,
	element: StructuringElement,
	iterations = 1,
): Image {
	let current = src;
	for (let i = 0; i < iterations; i++) current = dilateOnce(current, element);
	return current;
}

/**
 * normalize(NORM_MINMAX) to 0..255 in place: OpenCV's convertTo with the
 * f32 scale and shift.
 */
export function normalizeMinMax(image: Image): void {
	const { data } = image;
	let min = 255;
	let max = 0;
	for (const v of data) {
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const scaleD = max - min > Number.EPSILON ? 255 * (1 / (max - min)) : 0;
	const scale = f(scaleD);
	const shift = f(0 - min * scaleD);
	for (let i = 0; i < data.length; i++) {
		const v = roundHalfEven(f(f(data[i]! * scale) + shift));
		data[i] = Math.min(255, Math.max(0, v));
	}
}

/** Connected components of the non-zero pixels, with their bounding boxes and areas. */
export function connectedComponents(
	binary: Image,
	connectivity: 4 | 8 = 8,
): ConnectedComponents {
	const { rows, cols, data } = binary;
	const labels = new Int32Array(rows * cols);
	const stack: number[] = [];
	const stats: ComponentStats[] = [
		{ left: 0, top: 0, width: cols, height: rows, area: 0 },
	];
	let count = 1;
	for (let start = 0; start < labels.length; start++) {
		if (data[start] === 0) {
			stats[0]!.area++;
			continue;
		}
		if (labels[start] !== 0) continue;
		const label = count++;
		labels[start] = label;
		stack.push(start);
		let left = cols;
		let top = rows;
		let right = -1;
		let bottom = -1;
		let area = 0;
		while (stack.length > 0) {
			const i = stack.pop()!;
			const x = i % cols;
			const y = (i - x) / cols;
			area++;
			if (x < left) left = x;
			if (x > right) right = x;
			if (y < top) top = y;
			if (y > bottom) bottom = y;
			for (let dy = -1; dy <= 1; dy++) {
				const ny = y + dy;
				if (ny < 0 || ny >= rows) continue;
				for (let dx = -1; dx <= 1; dx++) {
					if (connectivity === 4 && dx !== 0 && dy !== 0) continue;
					const nx = x + dx;
					if (nx < 0 || nx >= cols) continue;
					const n = ny * cols + nx;
					if (data[n] !== 0 && labels[n] === 0) {
						labels[n] = label;
						stack.push(n);
					}
				}
			}
		}
		stats.push({
			left,
			top,
			width: right - left + 1,
			height: bottom - top + 1,
			area,
		});
	}
	return { count, labels, stats };
}

/**
 * Max over the element, decomposed: the max of each row's run is one
 * horizontal pass per run width (grown a pixel each side at a time), then
 * the rows of the element are a vertical max over those.
 */
function dilateOnce(src: Image, { halfWidths }: StructuringElement): Image {
	const { rows, cols, data } = src;
	const n = rows * cols;
	const ay = Math.floor(halfWidths.length / 2);
	const widest = Math.max(...halfWidths.map((w) => w ?? 0));
	const runMax = new Map<number, Uint8Array>();
	let previous = data;
	for (let w = 0; w <= widest; w++) {
		let current = previous;
		if (w > 0) {
			current = new Uint8Array(n);
			for (let y = 0; y < rows; y++) {
				const row = y * cols;
				for (let x = 0; x < cols; x++) {
					let v = previous[row + x]!;
					if (x >= w && data[row + x - w]! > v) v = data[row + x - w]!;
					if (x + w < cols && data[row + x + w]! > v) v = data[row + x + w]!;
					current[row + x] = v;
				}
			}
		}
		if (halfWidths.includes(w)) runMax.set(w, current);
		previous = current;
	}
	const out = createImage(rows, cols, 1);
	for (const [i, w] of halfWidths.entries()) {
		if (w === null) continue;
		const run = runMax.get(w)!;
		const dy = i - ay;
		for (let y = Math.max(0, -dy); y < Math.min(rows, rows - dy); y++) {
			const at = y * cols;
			const from = (y + dy) * cols;
			for (let x = 0; x < cols; x++) {
				if (run[from + x]! > out.data[at + x]!)
					out.data[at + x] = run[from + x]!;
			}
		}
	}
	return out;
}

/** BORDER_REFLECT_101 index */
function reflect101(i: number, n: number): number {
	if (n === 1) return 0;
	if (i < 0) return -i;
	if (i >= n) return 2 * n - 2 - i;
	return i;
}
