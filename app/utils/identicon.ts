import { LRUCache } from "~/modules/cache";

const GRID_SIZE = 7;
const HALF_GRID = Math.ceil(GRID_SIZE / 2);
const CELL_SIZE = 2;
const GRID_MARGIN = 5;
const VIEW_BOX_SIZE = GRID_SIZE * CELL_SIZE + GRID_MARGIN * 2;
const INTRINSIC_SIZE = 256;

const identiconCache = new LRUCache<string, string>({ max: 500 });

/**
 * Deterministic identicon for the given input, as a resolution independent `data:image/svg+xml`
 * URL usable as an `<img>` src. Same input always yields the same pattern and colors.
 */
export function generateIdenticon(input: string) {
	const cached = identiconCache.get(input);
	if (cached) return cached;

	const dataUrl = svgToDataUrl(identiconSvg(input));
	identiconCache.set(input, dataUrl);

	return dataUrl;
}

function identiconSvg(input: string) {
	const colors = generateColors(hashString(reverse(input)));

	return (
		`<svg xmlns='http://www.w3.org/2000/svg' width='${INTRINSIC_SIZE}' height='${INTRINSIC_SIZE}' viewBox='0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}' shape-rendering='crispEdges'>` +
		`<path fill='${colors.background}' d='M0,0h${VIEW_BOX_SIZE}v${VIEW_BOX_SIZE}h-${VIEW_BOX_SIZE}z'/>` +
		`<path fill='${colors.foreground}' d='${patternPath(hashString(input))}'/>` +
		"</svg>"
	);
}

function patternPath(patternHash: number) {
	const cells = filledCells(patternHash);
	if (cells.length === 0) return "";

	const x = centeringOffset(cells.map((cell) => cell.col));
	const y = centeringOffset(cells.map((cell) => cell.row));

	return cells
		.map((cell) => cellPath(x + cell.col * CELL_SIZE, y + cell.row * CELL_SIZE))
		.join("");
}

function filledCells(patternHash: number) {
	const cells: Array<{ row: number; col: number }> = [];

	for (let row = 0; row < GRID_SIZE; row++) {
		for (let col = 0; col < HALF_GRID; col++) {
			const shouldFill = (patternHash >>> (row * HALF_GRID + col)) & 1;
			if (!shouldFill) continue;

			cells.push({ row, col });

			const mirrorCol = GRID_SIZE - 1 - col;
			if (col !== mirrorCol) {
				cells.push({ row, col: mirrorCol });
			}
		}
	}

	return cells;
}

/** Offset that centers the occupied cells in the view box, so empty edge rows do not shift the pattern. */
function centeringOffset(occupied: Array<number>) {
	const min = Math.min(...occupied);
	const span = (Math.max(...occupied) - min + 1) * CELL_SIZE;

	return (VIEW_BOX_SIZE - span) / 2 - min * CELL_SIZE;
}

function cellPath(x: number, y: number) {
	return `M${x},${y}h${CELL_SIZE}v${CELL_SIZE}h-${CELL_SIZE}z`;
}

function hashString(str: string) {
	let hash = 5381;

	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
	}

	return hash;
}

function reverse(str: string) {
	return str.split("").reverse().join("");
}

function generateColors(hash: number) {
	const hue = hash % 360;
	const saturation = 65 + ((hash >>> 8) % 20);
	const lightness = 50 + ((hash >>> 16) % 20);

	return {
		background: `hsl(${hue},${saturation - 50}%,${lightness - 40}%)`,
		foreground: `hsl(${hue},${saturation}%,${lightness}%)`,
	};
}

function svgToDataUrl(svg: string) {
	return `data:image/svg+xml,${svg.replace(/[<>%\s]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`;
}
