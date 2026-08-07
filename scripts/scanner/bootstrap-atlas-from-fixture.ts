/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Bootstrap glyph atlases from the labeled reference fixtures: slices glyph
 * templates straight out of the reference frames, since the same scoreboard
 * captured through different pipelines (OBS virtual camera 720p, game
 * capture 1080p) yields subtly different pixels — every source contributes
 * its own crop per character and recognition takes the best-scoring one.
 * build-glyph-atlas.ts then fills in the rest of the charset from the
 * fonts, preserving these fixture-tagged glyphs.
 *
 * Usage: pnpm scanner:bootstrap-atlas
 * Writes public/assets/glyphs/scoreboard-{names,paint-digits,stat-digits}.{png,json}
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadOpenCV, type Mat } from "../../app/features/scanner/core/cv";
import {
	TAG_NAME_INNER,
	TAG_NAME_OUTER,
	TAG_NAME_TEXT_HEIGHT,
	TAG_TILT_DEG,
} from "../../app/features/scanner/core/detectors/death/rois";
import {
	nameRoi,
	paintRoi,
	ROW_CENTERS,
	statRoi,
	TEAM_SCORE_ROIS,
} from "../../app/features/scanner/core/detectors/scoreboard/rois";
import {
	CODE_TEXT_HEIGHT,
	REPLAY_CODE_ROI,
} from "../../app/features/scanner/core/detectors/scoreboard-battle-log-replay/rois";
import type { AtlasMeta } from "../../app/features/scanner/core/glyphs";
import {
	normalizeFrame,
	type Roi,
	toMat,
} from "../../app/features/scanner/core/image";
import { SCANNER_ASSETS_DIR } from "../../app/features/scanner/node/assets-dir";
import { FIXTURES_DIR } from "../../app/features/scanner/node/fixtures";
import { readImage, writePng } from "../../app/features/scanner/node/image-io";

const OUT_DIR = join(SCANNER_ASSETS_DIR, "glyphs");
const BIN_THRESHOLD = 150;

/** A labeled header tag region (positions are fixture-specific: tags size to their text). */
interface HeaderSpec {
	roi: Roi;
	label: string;
	splitHints?: number[];
	threshold?: number;
}

interface Source {
	frame: string;
	/** row labels, top to bottom; "" skips a row (e.g. unverifiable glyphs) */
	names: string[];
	paints: string[];
	/** per row: [ka, deaths, specials], zero-padded 2 digits as rendered */
	stats: string[][];
	teamScores: string[];
	/**
	 * Split hints are absolute x positions where merged segments must be cut
	 * (keyed by row index) — e.g. the "Te" in Teddy renders as one segment,
	 * with the exact boundary shifting a couple of pixels between sources.
	 */
	nameSplitHints: Record<number, number[]>;
	/** omit to skip header harvest for this source */
	header?: { lobby: HeaderSpec; mode: HeaderSpec; stage: HeaderSpec };
}

/** Ground-truth labels for the reference match (captured through two pipelines). */
const REFERENCE = {
	names: [
		"Pinhole",
		"Sunshield",
		"Headphones",
		"Now or Never Seven",
		"Charms",
		"Teddy",
		"Circle",
		"Fleece",
	],
	paints: ["842", "1217", "1768", "693", "1422", "980", "1204", "1053"],
	stats: [
		["12", "07", "02"],
		["07", "06", "03"],
		["04", "04", "05"],
		["04", "04", "02"],
		["09", "06", "05"],
		["07", "07", "05"],
		["08", "06", "03"],
		["05", "02", "04"],
	],
	/**
	 * Team totals render with an outline on the colored team box, so they get
	 * their own atlas rather than reusing paint digits. This fixture only
	 * contributes '5' and '0' — later fixtures extend the set (harvest keeps
	 * the first instance per char, so rerunning with more fixtures is additive).
	 */
	teamScores: ["500", "0"],
	header: {
		lobby: { roi: { x: 838, y: 44, w: 82, h: 26 }, label: "X Battle" },
		// mode is bold, stage is regular — harvested separately so shared letters
		// (e.g. both have an 'S') keep one template per face; bold text bridges
		// at threshold 150, 170 separates all but "pl"
		mode: {
			roi: { x: 832, y: 88, w: 216, h: 40 },
			label: "Splat Zones",
			splitHints: [877],
			threshold: 170,
		},
		stage: { roi: { x: 1078, y: 88, w: 160, h: 40 }, label: "Scorch Gorge" },
	},
};

/** Labeled source frames; every source contributes its own crop per character. */
const SOURCES: Source[] = [
	{
		frame: "scoreboard/xbattle-splat-zones-ko/frame.jpg",
		...REFERENCE,
		nameSplitHints: { 5: [1137] },
	},
	{
		frame: "scoreboard/xbattle-splat-zones-ko-capture/frame.png",
		...REFERENCE,
		nameSplitHints: { 5: [1135] },
	},
	{
		frame: "scoreboard/private-battle-splat-zones-ko-kera/frame.png",
		names: [
			"Mongering",
			"y0s",
			"fuzzy",
			"kera",
			"sigma",
			"Reefslider",
			"Cucumber",
			"tomato",
		],
		paints: ["503", "766", "624", "323", "500", "503", "427", "414"],
		stats: [
			["11", "01", "02"],
			["08", "00", "03"],
			["05", "02", "02"],
			["05", "03", "00"],
			["04", "03", "02"],
			["03", "06", "01"],
			["02", "05", "02"],
			["01", "06", "01"],
		],
		teamScores: ["500", "0"],
		nameSplitHints: {},
	},
	{
		// This capture renders names slightly smaller than the reference: its
		// 'T' (9x15) loses to the taller reference crops, and its baseline dots
		// are pure homoglyphs the font templates can't split — '.' renders 4px,
		// '・' 5px, so exact crops separate them via the ink-coverage penalty.
		// Only the dot/T rows are labeled; the rest add nothing new.
		frame: "scoreboard/robot/frame.png",
		names: ["R.O.B.O.T", "", "", "", "", "Rαι×ι..・", "", ""],
		paints: ["", "", "", "", "", "", "", ""],
		stats: [
			["", "", ""],
			["", "", ""],
			["", "", ""],
			["", "", ""],
			["", "", ""],
			["", "", ""],
			["", "", ""],
			["", "", ""],
		],
		teamScores: ["", ""],
		nameSplitHints: {},
	},
	{
		frame: "scoreboard/splash-sploosh/frame.png",
		// rows 2 and 7 hold kana/symbol glyphs not yet verified char-by-char
		names: [
			"Bocchi",
			"have faith",
			"",
			"Florescent",
			"Elis",
			"Jrod_14",
			"GOLD SHIP",
			"",
		],
		paints: ["1422", "1161", "993", "1046", "1662", "1105", "799", "1155"],
		stats: [
			["15", "10", "06"],
			["13", "06", "04"],
			["06", "02", "05"],
			["13", "06", "05"],
			["15", "02", "06"],
			["10", "10", "03"],
			["02", "02", "04"],
			["08", "12", "06"],
		],
		teamScores: ["500", "0"],
		nameSplitHints: {},
	},
];

/** Team totals sit on the light team-color pattern; binarize higher. */
const TEAM_BIN_THRESHOLD = 175;

const cv = await loadOpenCV();

/** Normalized grayscale of the source frame currently being harvested. */
let gray: Mat;

async function loadGray(framePath: string): Promise<Mat> {
	const srcMat = toMat(await readImage(join(FIXTURES_DIR, framePath)));
	const frame = normalizeFrame(srcMat);
	srcMat.delete();
	const out = new cv.Mat();
	cv.cvtColor(frame, out, cv.COLOR_RGBA2GRAY);
	frame.delete();
	return out;
}

/** Green channel instead of luminance — the replay code is green-on-dark. */
async function loadGreen(framePath: string): Promise<Mat> {
	const srcMat = toMat(await readImage(join(FIXTURES_DIR, framePath)));
	const frame = normalizeFrame(srcMat);
	srcMat.delete();
	const channels = new cv.MatVector();
	cv.split(frame, channels);
	frame.delete();
	const g = channels.get(1);
	const out = new cv.Mat();
	g.copyTo(out);
	g.delete();
	channels.delete();
	return out;
}

/**
 * Death splash-tag name band, prepared the way the detector reads it
 * (see src/core/detectors/death/index.ts): crop the tilted tag, rotate it
 * level, crop the name band, then map each pixel to its max-channel
 * distance from the median banner color, normalized to 0-255.
 */
async function loadTagBand(framePath: string): Promise<Mat> {
	const srcMat = toMat(await readImage(join(FIXTURES_DIR, framePath)));
	const frame = normalizeFrame(srcMat);
	srcMat.delete();
	const rgb = new cv.Mat();
	cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);
	frame.delete();

	const outerView = rgb.roi(
		new cv.Rect(
			TAG_NAME_OUTER.x,
			TAG_NAME_OUTER.y,
			TAG_NAME_OUTER.w,
			TAG_NAME_OUTER.h,
		),
	);
	const outer = new cv.Mat();
	outerView.copyTo(outer);
	outerView.delete();
	rgb.delete();
	const center = new cv.Point(outer.cols / 2, outer.rows / 2);
	const m = cv.getRotationMatrix2D(center, -TAG_TILT_DEG, 1);
	const rotated = new cv.Mat();
	cv.warpAffine(
		outer,
		rotated,
		m,
		new cv.Size(outer.cols, outer.rows),
		cv.INTER_LINEAR,
		cv.BORDER_REPLICATE,
		new cv.Scalar(),
	);
	m.delete();
	outer.delete();
	const innerView = rotated.roi(
		new cv.Rect(
			TAG_NAME_INNER.x,
			TAG_NAME_INNER.y,
			TAG_NAME_INNER.w,
			TAG_NAME_INNER.h,
		),
	);
	const inner = new cv.Mat();
	innerView.copyTo(inner);
	innerView.delete();
	rotated.delete();

	const n = inner.rows * inner.cols;
	const px = inner.data;
	const background: number[] = [];
	for (let c = 0; c < 3; c++) {
		const hist = new Array<number>(256).fill(0);
		for (let i = 0; i < n; i++) hist[px[i * 3 + c]!]!++;
		let acc = 0;
		let v = 0;
		for (; v < 255; v++) {
			acc += hist[v]!;
			if (acc >= n / 2) break;
		}
		background.push(v);
	}
	const band = new cv.Mat(inner.rows, inner.cols, cv.CV_8UC1);
	const out = band.data;
	for (let i = 0; i < n; i++) {
		out[i] = Math.max(
			Math.abs(px[i * 3]! - background[0]!),
			Math.abs(px[i * 3 + 1]! - background[1]!),
			Math.abs(px[i * 3 + 2]! - background[2]!),
		);
	}
	inner.delete();
	cv.normalize(band, band, 0, 255, cv.NORM_MINMAX);
	clearBorderBlobs(band, TAG_BIN_THRESHOLD);
	return band;
}

/**
 * Zero out ink components touching the band border, exactly as the
 * detector does before parsing (see clearBorderBlobs in death/index.ts):
 * banner art and title-line slivers enter at the band edges, and without
 * this they join the column runs (mismatching the label) or push a crop's
 * tight box past the band edge.
 */
function clearBorderBlobs(band: Mat, threshold: number): void {
	const bin = new cv.Mat();
	cv.threshold(band, bin, threshold, 255, cv.THRESH_BINARY);
	const labels = new cv.Mat();
	const stats = new cv.Mat();
	const centroids = new cv.Mat();
	const count = cv.connectedComponentsWithStats(
		bin,
		labels,
		stats,
		centroids,
		8,
	);
	bin.delete();
	centroids.delete();
	const s = stats.data32S;
	const touchesBorder = new Uint8Array(count);
	for (let i = 1; i < count; i++) {
		const left = s[i * 5 + cv.CC_STAT_LEFT]!;
		const top = s[i * 5 + cv.CC_STAT_TOP]!;
		const right = left + s[i * 5 + cv.CC_STAT_WIDTH]!;
		const bottom = top + s[i * 5 + cv.CC_STAT_HEIGHT]!;
		touchesBorder[i] =
			left === 0 || top === 0 || right === band.cols || bottom === band.rows
				? 1
				: 0;
	}
	stats.delete();
	const lab = labels.data32S;
	const out = band.data;
	for (let i = 0; i < out.length; i++) {
		if (touchesBorder[lab[i]!]!) out[i] = 0;
	}
	labels.delete();
}

function columnRuns(
	roi: Roi,
	splitHints: number[] = [],
	threshold = BIN_THRESHOLD,
	mergeHints: number[] = [],
): { x0: number; x1: number }[] {
	let runs: { x0: number; x1: number }[] = [];
	let start = -1;
	for (let x = roi.x; x < roi.x + roi.w; x++) {
		let count = 0;
		for (let y = roi.y; y < roi.y + roi.h; y++) {
			if (gray.ucharPtr(y, x)[0]! > threshold) count++;
		}
		const on = count >= 1;
		if (on && start < 0) start = x;
		if (!on && start >= 0) {
			if (x - start >= 2) runs.push({ x0: start, x1: x });
			start = -1;
		}
	}
	if (start >= 0) runs.push({ x0: start, x1: roi.x + roi.w });
	// Merge hints bridge runs that belong to one glyph (multi-stroke kana
	// like パ segments as two strokes): a hint x inside the gap between two
	// consecutive runs joins them into a single crop.
	for (const hint of mergeHints) {
		const i = runs.findIndex(
			(r, idx) =>
				idx + 1 < runs.length && r.x1 <= hint && runs[idx + 1]!.x0 >= hint,
		);
		if (i >= 0) {
			runs = [
				...runs.slice(0, i),
				{ x0: runs[i]!.x0, x1: runs[i + 1]!.x1 },
				...runs.slice(i + 2),
			];
		}
	}
	return runs.flatMap((run) => {
		const cuts = splitHints
			.filter((h) => h > run.x0 + 1 && h < run.x1 - 1)
			.sort((a, b) => a - b);
		if (cuts.length === 0) return [run];
		const parts: { x0: number; x1: number }[] = [];
		let x0 = run.x0;
		for (const cut of cuts) {
			parts.push({ x0, x1: cut });
			x0 = cut;
		}
		parts.push({ x0, x1: run.x1 });
		return parts;
	});
}

function cropGlyph(
	run: { x0: number; x1: number },
	roi: Roi,
	threshold = BIN_THRESHOLD,
): Mat {
	// tight vertical bounds within the run
	let yMin = roi.y + roi.h;
	let yMax = -1;
	for (let y = roi.y; y < roi.y + roi.h; y++) {
		for (let x = run.x0; x < run.x1; x++) {
			if (gray.ucharPtr(y, x)[0]! > threshold) {
				if (y < yMin) yMin = y;
				if (y > yMax) yMax = y;
			}
		}
	}
	const pad = 1;
	const rect = new cv.Rect(
		run.x0 - pad,
		yMin - pad,
		run.x1 - run.x0 + 2 * pad,
		yMax - yMin + 1 + 2 * pad,
	);
	const view = gray.roi(rect);
	const out = new cv.Mat();
	view.copyTo(out);
	view.delete();
	// Apply the same background masking recognizeText uses at match time, so
	// templates harvested off colored backgrounds stay comparable.
	const binary = new cv.Mat();
	cv.threshold(out, binary, threshold, 255, cv.THRESH_BINARY);
	const mask = new cv.Mat();
	const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
	cv.dilate(binary, mask, kernel, new cv.Point(-1, -1), 2);
	kernel.delete();
	binary.delete();
	const masked = new cv.Mat(out.rows, out.cols, cv.CV_8UC1, new cv.Scalar(0));
	out.copyTo(masked, mask);
	out.delete();
	mask.delete();
	return masked;
}

/**
 * Slice a labeled text ROI into per-char crops. A Map collector keeps the
 * first instance per char (digits render identically everywhere); an array
 * collector keeps every instance — letters land on different subpixel
 * phases, so each occurrence is a distinct, equally-authoritative exemplar.
 */
function harvest(
	roi: Roi,
	label: string,
	collected: Map<string, Mat> | [string, Mat][],
	splitHints: number[] = [],
	threshold = BIN_THRESHOLD,
	mergeHints: number[] = [],
): void {
	if (label === "") return;
	const chars = [...label.replace(/ /g, "")];
	const runs = columnRuns(roi, splitHints, threshold, mergeHints);
	if (runs.length !== chars.length) {
		console.warn(
			`segment mismatch for "${label}": ${runs.length} segments vs ${chars.length} chars — skipped`,
		);
		return;
	}
	runs.forEach((run, i) => {
		const ch = chars[i]!;
		if (Array.isArray(collected)) {
			collected.push([ch, cropGlyph(run, roi, threshold)]);
		} else if (!collected.has(ch)) {
			collected.set(ch, cropGlyph(run, roi, threshold));
		}
	});
}

function writeAtlas(
	name: string,
	height: number,
	collected: Map<string, Mat> | [string, Mat][],
): void {
	const entries =
		collected instanceof Map ? [...collected.entries()] : collected;
	const glyphs = entries.sort(([a], [b]) => a.localeCompare(b));
	if (glyphs.length === 0) {
		console.warn(`${name}: nothing harvested, atlas not written`);
		return;
	}
	const spacing = 2;
	const totalW =
		glyphs.reduce((acc, [, m]) => acc + m.cols, 0) +
		spacing * (glyphs.length + 1);
	const maxH = Math.max(...glyphs.map(([, m]) => m.rows)) + 2 * spacing;
	const atlas = new cv.Mat(maxH, totalW, cv.CV_8UC1, new cv.Scalar(0));

	const meta: AtlasMeta = { height, glyphs: [] };
	let x = spacing;
	for (const [char, m] of glyphs) {
		const view = atlas.roi(new cv.Rect(x, spacing, m.cols, m.rows));
		m.copyTo(view);
		view.delete();
		meta.glyphs.push({
			char,
			x,
			y: spacing,
			w: m.cols,
			h: m.rows,
			source: "fixture",
		});
		x += m.cols + spacing;
	}

	const rgba = new cv.Mat();
	cv.cvtColor(atlas, rgba, cv.COLOR_GRAY2RGBA);
	writePng(join(OUT_DIR, `${name}.png`), {
		width: rgba.cols,
		height: rgba.rows,
		data: new Uint8ClampedArray(rgba.data),
	});
	writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(meta, null, 2));
	atlas.delete();
	rgba.delete();
	console.info(
		`${name}: ${glyphs.length} glyphs -> ${OUT_DIR}/${name}.{png,json}`,
	);
}

mkdirSync(OUT_DIR, { recursive: true });

// One crop per char per source: each source keeps its own first-instance map,
// and the atlases carry every source's crops side by side.
const nameEntries: [string, Mat][] = [];
const paintEntries: [string, Mat][] = [];
const statEntries: [string, Mat][] = [];
const teamEntries: [string, Mat][] = [];
const lobbyEntries: [string, Mat][] = [];
const lineEntries: [string, Mat][] = [];

for (const source of SOURCES) {
	console.info(`harvesting ${source.frame}`);
	gray = await loadGray(source.frame);

	const nameGlyphs: [string, Mat][] = [];
	ROW_CENTERS.forEach((cy, row) => {
		// name region may include paint digits for long names; stop where digits start
		harvest(
			{ ...nameRoi(cy), w: 196 },
			source.names[row]!,
			nameGlyphs,
			source.nameSplitHints[row] ?? [],
		);
	});
	nameEntries.push(...nameGlyphs);

	const paintGlyphs = new Map<string, Mat>();
	ROW_CENTERS.forEach((cy, row) => {
		harvest(paintRoi(cy), source.paints[row]!, paintGlyphs);
	});
	paintEntries.push(...paintGlyphs.entries());

	const statGlyphs = new Map<string, Mat>();
	ROW_CENTERS.forEach((cy, row) => {
		for (const i of [0, 1, 2] as const) {
			harvest(statRoi(cy, i), source.stats[row]![i]!, statGlyphs);
		}
	});
	statEntries.push(...statGlyphs.entries());

	const teamGlyphs = new Map<string, Mat>();
	TEAM_SCORE_ROIS.forEach((roi, i) => {
		harvest(roi, source.teamScores[i]!, teamGlyphs, [], TEAM_BIN_THRESHOLD);
	});
	teamEntries.push(...teamGlyphs.entries());

	// Header tags: lobby line (BlitzMain ~24px), then mode (BlitzBold ~35px) and
	// stage (BlitzMain ~22px) side by side.
	if (source.header) {
		const { lobby, mode, stage } = source.header;
		const lobbyGlyphs = new Map<string, Mat>();
		harvest(
			lobby.roi,
			lobby.label,
			lobbyGlyphs,
			lobby.splitHints,
			lobby.threshold,
		);
		lobbyEntries.push(...lobbyGlyphs.entries());

		const modeGlyphs = new Map<string, Mat>();
		harvest(mode.roi, mode.label, modeGlyphs, mode.splitHints, mode.threshold);
		const stageGlyphs = new Map<string, Mat>();
		harvest(
			stage.roi,
			stage.label,
			stageGlyphs,
			stage.splitHints,
			stage.threshold,
		);
		lineEntries.push(...modeGlyphs.entries(), ...stageGlyphs.entries());
	}

	gray.delete();
}

// Replay-browser fixtures: the code line renders in FOT-RowdyStd, which no
// live-scoreboard atlas covers. Letters land on different subpixel phases,
// so keep every occurrence (array collector), like names.
const REPLAY_SOURCES: { frame: string; code: string }[] = [
	{
		frame:
			"scoreboard-battle-log-replay/private-battle-splat-zones-hagglefish/frame.jpeg",
		code: "R6KE-D064-3CXD-XVKL",
	},
	{
		frame:
			"scoreboard-battle-log-replay/anarchy-open-rainmaker-knockout-museum/frame.png",
		code: "RWYQ-4X37-M1EL-EGGQ",
	},
	{
		frame:
			"scoreboard-battle-log-replay/private-battle-crableg-capital/frame.png",
		code: "R1V4-PAHW-GGM2-PD9S",
	},
	// Heavily compressed stream captures: font-rendered templates lose to
	// fixture crops of lookalikes on these (E beat a real F by 0.1+), so the
	// chars they cover (8 B F J N T U 5 among them) need crops at this
	// fidelity. brinewater-1411/marlin stay out as generalization checks.
	{
		frame:
			"scoreboard-battle-log-replay/x-battle-rainmaker-brinewater-1404/frame.png",
		code: "R80B-00DL-WF4X-V3CA",
	},
	{
		frame:
			"scoreboard-battle-log-replay/x-battle-rainmaker-brinewater-1416/frame.png",
		code: "RUH3-3NEF-F5FY-PAJL",
	},
	{
		frame:
			"scoreboard-battle-log-replay/x-battle-rainmaker-urchin-1434/frame.png",
		code: "RUCT-5HNH-XWDC-J51U",
	},
];

const codeEntries: [string, Mat][] = [];
for (const source of REPLAY_SOURCES) {
	console.info(`harvesting ${source.frame}`);
	gray = await loadGreen(source.frame);
	const codeGlyphs: [string, Mat][] = [];
	harvest(REPLAY_CODE_ROI, source.code, codeGlyphs);
	codeEntries.push(...codeGlyphs);
	gray.delete();
}

// Death splash-tag names (BlitzBold + Rowdy kana at ~46px). The atlas is
// nominal 42 with the detector upscaling to 46 at load (see the builder
// comment in scripts/scanner/build-glyph-atlas.ts), so native-size crops shrink to
// 42 here and come back to native after the load-time upscale.
const TAG_BIN_THRESHOLD = 160; // TAG_NAME_BIN_THRESHOLD in death/index.ts
const TAG_ATLAS_HEIGHT = 42;
const DEATH_TAG_SOURCES: {
	frame: string;
	label: string;
	mergeHints?: number[];
}[] = [
	{
		frame: "death/fxg-supaatan-slosher/frame.png",
		label: "FxG スパータン",
		// パ renders as two disconnected strokes; bridge them into one crop
		mergeHints: [340],
	},
	{
		frame: "death/classic-squiffer-jp/frame.png",
		label: "ごあんぜんに",
		// に's bar and body never connect; bridge them into one crop
		mergeHints: [431],
	},
	{
		frame: "death/wipeout-52-gal/frame.png",
		label: "さんだいめドパかげ",
		// だ (1px column gap), い, ド, パ, げ all segment as disconnected
		// strokes/marks; bridge each into one crop
		mergeHints: [176, 236, 366, 408, 528],
	},
];

const tagEntries: [string, Mat][] = [];
for (const source of DEATH_TAG_SOURCES) {
	console.info(`harvesting ${source.frame}`);
	gray = await loadTagBand(source.frame);
	const tagGlyphs: [string, Mat][] = [];
	harvest(
		{ x: 0, y: 0, w: gray.cols, h: gray.rows },
		source.label,
		tagGlyphs,
		[],
		TAG_BIN_THRESHOLD,
		source.mergeHints ?? [],
	);
	gray.delete();
	const factor = TAG_ATLAS_HEIGHT / TAG_NAME_TEXT_HEIGHT;
	for (const [char, mat] of tagGlyphs) {
		const scaledMat = new cv.Mat();
		cv.resize(mat, scaledMat, new cv.Size(0, 0), factor, factor, cv.INTER_AREA);
		mat.delete();
		tagEntries.push([char, scaledMat]);
	}
}

// JA death-message lines (condensed Kurokane/Rowdy blend at ~40px; the
// atlas is native-size, matched unscaled by the detector's JA read path).
// ROIs are fixture-specific tight boxes around each line so scene ink
// outside the burst stays out of the runs.
const DEATH_JA_BIN_THRESHOLD = 190; // SPLAT_TEXT_BIN_THRESHOLD in death/rois.ts
const DEATH_JA_SOURCES: {
	frame: string;
	lines: { roi: Roi; label: string; mergeHints?: number[] }[];
}[] = [
	{
		frame: "death/classic-squiffer-jp/frame.png",
		lines: [
			// ッ renders as two disconnected strokes; bridge them into one crop
			{
				roi: { x: 825, y: 358, w: 275, h: 58 },
				label: "スクイックリンα で",
				mergeHints: [917],
			},
			{ roi: { x: 880, y: 410, w: 155, h: 56 }, label: "やられた！" },
		],
	},
];

const deathJaEntries: [string, Mat][] = [];
for (const source of DEATH_JA_SOURCES) {
	console.info(`harvesting ${source.frame}`);
	gray = await loadGray(source.frame);
	for (const line of source.lines) {
		harvest(
			line.roi,
			line.label,
			deathJaEntries,
			[],
			DEATH_JA_BIN_THRESHOLD,
			line.mergeHints ?? [],
		);
	}
	gray.delete();
}

writeAtlas("scoreboard-names", 22, nameEntries);
writeAtlas("scoreboard-paint-digits", 28, paintEntries);
writeAtlas("scoreboard-stat-digits", 17, statEntries);
writeAtlas("scoreboard-team-digits", 33, teamEntries);
writeAtlas("scoreboard-header-lobby", 19, lobbyEntries);
writeAtlas("scoreboard-header-line", 24, lineEntries);
writeAtlas("scoreboard-replay-code", CODE_TEXT_HEIGHT, codeEntries);
writeAtlas("death-tag-name", TAG_ATLAS_HEIGHT, tagEntries);
writeAtlas("death-weapon-ja", 40, deathJaEntries);
