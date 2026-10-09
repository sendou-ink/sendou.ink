/**
 * Tower Control / Rainmaker counter overlay: a dotted track under the icon
 * strip with the objective's icon riding it, and a "Remaining" plate per team
 * hanging under the furthest point that team pushed to. Both modes draw the
 * same overlay (only the checkpoint markers differ), so the read is shared.
 *
 * - Gate: the track's dots sit at a fixed pitch and phase in every lobby, so
 *   a comb projected at that phase (dot rows standing out from the rows just
 *   above and below) proves the track whatever the backdrop and markers.
 * - Icon: scored procedurally along the line, no templates. A held icon is a
 *   team-ink disc around a white glyph; the neutral one (idle tower, dropped
 *   Rainmaker) a white ring around an olive disc. Its x maps linearly onto
 *   -100 (left end) .. 100 (right end); the left team pushes right.
 * - Holder: the held icon's ink hue against each side's ink, read off that
 *   side's own end of the track (its marker and first dots).
 * - Scores: every confident digit run in the plate band, each assigned to the
 *   team whose ink surrounds it — a plate sits on the half its team pushes
 *   into, which bounds the assignment. No label is read (localized).
 */
import type { Mat } from "../../cv";
import { type GlyphSet, recognizeTextSteps } from "../../glyphs";
import { copyRoi, minChannel, type Roi } from "../../image";
import {
	dominantInkColor,
	hueDistance,
	hueOf,
	type InkRgb,
} from "../../ink-color";
import { all, type MatchSteps } from "../../match-steps";
import type { BannerScoreRead } from "../scoreboard/banner";
import {
	TRACK_CENTER_X,
	TRACK_COMB_DROPPED_WINDOWS,
	TRACK_COMB_OFFSET_Y,
	TRACK_COMB_SPAN,
	TRACK_COMB_WINDOW,
	TRACK_DARK_MAX_VALUE,
	TRACK_DOT_PITCH,
	TRACK_END_INK_ICON_CLEARANCE,
	TRACK_END_INK_ROIS,
	TRACK_FIRST_DOT_X,
	TRACK_HALF_LENGTH,
	TRACK_ICON_CORE_RADII,
	TRACK_ICON_MAX_TEAM_HUE_DIST,
	TRACK_ICON_MIN_SCORE,
	TRACK_ICON_RING_RADII,
	TRACK_ICON_SPAN,
	TRACK_ICON_Y_JITTER,
	TRACK_INK_MIN_SPREAD,
	TRACK_INK_MIN_VALUE,
	TRACK_MARKER_ICON_CLEARANCE,
	TRACK_MARKER_MIN_SCORE,
	TRACK_NEUTRAL_DISC_RADII,
	TRACK_NEUTRAL_RING_RADII,
	TRACK_OLIVE_HUE_RANGE,
	TRACK_OLIVE_MAX_VALUE,
	TRACK_OLIVE_MIN_SPREAD,
	TRACK_PEDESTAL,
	TRACK_PEDESTAL_SPAN,
	TRACK_PLATE_BIN_THRESHOLD,
	TRACK_PLATE_CENTER_SLACK,
	TRACK_PLATE_DIGIT_MIN_CONF,
	TRACK_PLATE_DIGIT_ROI,
	TRACK_PLATE_INK_PAD_X,
	TRACK_SQUARE_SIZES,
	TRACK_SQUARE_SPAN,
	TRACK_STRIP_INK_ROIS,
	TRACK_WHITE_MAX_SPREAD,
	TRACK_WHITE_MIN_VALUE,
	TRACK_Y,
} from "./rois";

const RING_SAMPLES = 32;
/** Digits of one number nearly touch; a gap past this fraction of a digit width ends the run. */
const DIGIT_GAP_MAX_RATIO = 0.55;
/** Digits span the set's full height; the label's lowercase letters top out lower. */
const DIGIT_MIN_HEIGHT_RATIO = 0.82;
const MAX_COUNT = 100;

export interface TrackRead {
	/** icon position, -100 (left end) .. 100 (right end); null = no icon found */
	position: number | null;
	/** which side holds the objective; null = neutral or unattributable */
	holder: 0 | 1 | null;
	score: [BannerScoreRead, BannerScoreRead];
	teamColor: [InkRgb | null, InkRgb | null];
	/** TC by its checkpoint squares, RM by its pedestals; null when neither shows */
	mode: "TC" | "RM" | null;
	/** the icon's shape score; null = no icon */
	iconScore: number | null;
	debug: Record<string, unknown>;
}

/** Comb projection of the track's dot row at its fixed phase, per window with the worst dropped; see GATE_TRACK_MIN_COMB. */
export function trackComb(frame: Mat): number {
	const [x0, x1] = TRACK_COMB_SPAN;
	const band = copyRoi(frame, {
		x: x0,
		y: TRACK_Y - TRACK_COMB_OFFSET_Y - 1,
		w: x1 - x0 + 1,
		h: 2 * TRACK_COMB_OFFSET_Y + 3,
	});
	const { data, cols } = band;
	const channels = band.channels();
	const at = (x: number, y: number) => (y * cols + x) * channels;
	const distance = (a: number, b: number) =>
		Math.abs(data[a]! - data[b]!) +
		Math.abs(data[a + 1]! - data[b + 1]!) +
		Math.abs(data[a + 2]! - data[b + 2]!);

	const contrast: number[] = [];
	for (let x = 0; x < cols; x++) {
		let sum = 0;
		for (let dy = -1; dy <= 1; dy++) {
			const y = TRACK_COMB_OFFSET_Y + 1 + dy;
			const center = at(x, y);
			sum += Math.min(
				distance(center, at(x, y - TRACK_COMB_OFFSET_Y)),
				distance(center, at(x, y + TRACK_COMB_OFFSET_Y)),
			);
		}
		contrast.push(sum / 3);
	}
	band.delete();

	const windows: number[] = [];
	for (
		let start = 0;
		start + TRACK_COMB_WINDOW <= contrast.length;
		start += TRACK_COMB_WINDOW
	) {
		const window = contrast.slice(start, start + TRACK_COMB_WINDOW);
		const mean = window.reduce((a, b) => a + b, 0) / window.length;
		let projection = 0;
		for (const [i, value] of window.entries()) {
			const phase =
				(2 * Math.PI * (x0 + start + i - TRACK_FIRST_DOT_X)) / TRACK_DOT_PITCH;
			projection += (value - mean) * Math.cos(phase);
		}
		windows.push(projection / window.length);
	}
	const kept = windows.sort((a, b) => a - b).slice(TRACK_COMB_DROPPED_WINDOWS);
	return kept.reduce((a, b) => a + b, 0) / kept.length;
}

/** The track overlay's icon, holder, plates and team inks off one frame. */
export function* readTrackSteps(
	frame: Mat,
	digitSets: readonly GlyphSet[],
	speculative: boolean,
): MatchSteps<TrackRead> {
	const band = trackBandClasses(frame);
	const icon = locateIcon(band);
	const markers = markerMode(band, icon);
	const teamColor = ([0, 1] as const).map((side) => {
		const rois = TRACK_END_INK_ROIS[side];
		const iconClear =
			icon === null ||
			rois.every(
				(roi) =>
					Math.abs(icon.x - (roi.x + roi.w / 2)) > TRACK_END_INK_ICON_CLEARANCE,
			);
		return (
			(iconClear ? dominantInkColor(frame, rois) : null) ??
			dominantInkColor(frame, [TRACK_STRIP_INK_ROIS[side]])
		);
	}) as [InkRgb | null, InkRgb | null];
	const teamHues = teamColor.map((color) => (color ? hueOf(color) : null)) as [
		number | null,
		number | null,
	];

	const holder =
		icon?.kind === "held" && icon.hue !== null
			? nearestSide(icon.hue, teamHues)
			: null;

	const plateReads = yield* readPlates(frame, digitSets, teamHues, speculative);

	return {
		position:
			icon === null
				? null
				: Math.round(
						Math.max(
							-100,
							Math.min(
								100,
								((icon.x - TRACK_CENTER_X) / TRACK_HALF_LENGTH) * 100,
							),
						),
					),
		holder,
		score: plateReads.score,
		teamColor,
		mode: markers.mode,
		iconScore: icon?.score ?? null,
		debug: {
			icon,
			markers,
			teamHues,
			plates: plateReads.runs,
		},
	};
}

interface IconHit {
	kind: "held" | "neutral";
	x: number;
	y: number;
	score: number;
	/** circular-mean hue of the held icon's ink ring; null for neutral */
	hue: number | null;
}

interface PixelClasses {
	cols: number;
	rows: number;
	ink: Uint8Array;
	white: Uint8Array;
	olive: Uint8Array;
	dark: Uint8Array;
	hue: Float32Array;
	/** band origin in frame coordinates */
	x0: number;
	y0: number;
}

/** Pixel classes of the band the icon and the checkpoint markers can occupy. */
function trackBandClasses(frame: Mat): PixelClasses {
	const maxRadius = Math.max(...TRACK_NEUTRAL_RING_RADII) + 1;
	const margin = Math.ceil(maxRadius) + TRACK_ICON_Y_JITTER;
	const [spanX0, spanX1] = TRACK_ICON_SPAN;
	return classifyPixels(frame, {
		x: spanX0 - margin,
		y: TRACK_Y - margin,
		w: spanX1 - spanX0 + 2 * margin + 1,
		h: 2 * margin + 1,
	});
}

/** Best held or neutral icon along the track line; null under TRACK_ICON_MIN_SCORE. */
function locateIcon(classes: PixelClasses): IconHit | null {
	const [spanX0, spanX1] = TRACK_ICON_SPAN;

	const scoreAt = (kind: IconHit["kind"], x: number, y: number) =>
		kind === "held"
			? ringFraction(classes, x, y, TRACK_ICON_RING_RADII, classes.ink) *
				ringFraction(classes, x, y, TRACK_ICON_CORE_RADII, classes.white)
			: ringFraction(classes, x, y, TRACK_NEUTRAL_RING_RADII, classes.white) *
				ringFraction(classes, x, y, TRACK_NEUTRAL_DISC_RADII, classes.olive);

	let best: IconHit | null = null;
	for (const kind of ["held", "neutral"] as const) {
		for (let x = spanX0; x <= spanX1; x++) {
			const score = scoreAt(kind, x, TRACK_Y);
			if (!best || score > best.score) {
				best = { kind, x, y: TRACK_Y, score, hue: null };
			}
		}
	}
	if (!best) return null;
	for (let dy = -TRACK_ICON_Y_JITTER; dy <= TRACK_ICON_Y_JITTER; dy++) {
		for (let dx = -2; dx <= 2; dx++) {
			const score = scoreAt(best.kind, best.x + dx, TRACK_Y + dy);
			if (score > best.score) {
				best = { ...best, x: best.x + dx, y: TRACK_Y + dy, score };
			}
		}
	}
	if (best.score < TRACK_ICON_MIN_SCORE) return null;
	return best.kind === "held"
		? { ...best, hue: ringHue(classes, best.x, best.y) }
		: best;
}

function classifyPixels(frame: Mat, roi: Roi): PixelClasses {
	const crop = copyRoi(frame, roi);
	const { data, cols, rows } = crop;
	const channels = crop.channels();
	const ink = new Uint8Array(cols * rows);
	const white = new Uint8Array(cols * rows);
	const olive = new Uint8Array(cols * rows);
	const dark = new Uint8Array(cols * rows);
	const hue = new Float32Array(cols * rows);
	for (let i = 0; i < cols * rows; i++) {
		const color = {
			r: data[i * channels]!,
			g: data[i * channels + 1]!,
			b: data[i * channels + 2]!,
		};
		const max = Math.max(color.r, color.g, color.b);
		const min = Math.min(color.r, color.g, color.b);
		const spread = max - min;
		ink[i] =
			spread >= TRACK_INK_MIN_SPREAD && max >= TRACK_INK_MIN_VALUE ? 1 : 0;
		white[i] =
			min >= TRACK_WHITE_MIN_VALUE && spread <= TRACK_WHITE_MAX_SPREAD ? 1 : 0;
		dark[i] = max <= TRACK_DARK_MAX_VALUE ? 1 : 0;
		hue[i] = ink[i] ? hueOf(color) : 0;
		if (spread >= TRACK_OLIVE_MIN_SPREAD && max <= TRACK_OLIVE_MAX_VALUE) {
			const oliveHue = hueOf(color);
			olive[i] =
				oliveHue >= TRACK_OLIVE_HUE_RANGE[0] &&
				oliveHue <= TRACK_OLIVE_HUE_RANGE[1]
					? 1
					: 0;
		}
	}
	crop.delete();
	return { cols, rows, ink, white, olive, dark, hue, x0: roi.x, y0: roi.y };
}

/**
 * TC or RM off the checkpoint markers: TC draws black-framed squares (a
 * crosshair over pale ink quadrants), RM team-ink pedestals between a white
 * cap and base. Markers the icon covers are skipped. Over the TC/RM VoDs:
 * pedestals score >=0.8 on RM and <=0.2 on TC; squares >=0.5 (mostly >=0.8,
 * lower as passed checkpoints vanish) on TC and <=0.7 on RM.
 */
function markerMode(
	classes: PixelClasses,
	icon: IconHit | null,
): { mode: "TC" | "RM" | null; square: number; pedestal: number } {
	const fraction = (
		mask: Uint8Array,
		points: readonly (readonly [number, number])[],
	) => {
		let hits = 0;
		for (const [x, y] of points) {
			const px = Math.round(x) - classes.x0;
			const py = Math.round(y) - classes.y0;
			if (px < 0 || py < 0 || px >= classes.cols || py >= classes.rows) {
				continue;
			}
			hits += mask[py * classes.cols + px]!;
		}
		return hits / points.length;
	};
	const line = (fromX: number, fromY: number, toX: number, toY: number) =>
		Array.from({ length: 12 }, (_, i) => {
			const f = i / 11;
			return [fromX + (toX - fromX) * f, fromY + (toY - fromY) * f] as const;
		});

	let square = 0;
	let pedestal = 0;
	const within = (x: number, [lo, hi]: readonly [number, number]) =>
		x >= lo && x <= hi;
	for (
		let x = Math.min(TRACK_SQUARE_SPAN[0], TRACK_PEDESTAL_SPAN[0]);
		x <= Math.max(TRACK_SQUARE_SPAN[1], TRACK_PEDESTAL_SPAN[1]);
		x++
	) {
		if (icon && Math.abs(icon.x - x) < TRACK_MARKER_ICON_CLEARANCE) continue;
		for (const size of within(x, TRACK_SQUARE_SPAN) ? TRACK_SQUARE_SIZES : []) {
			const h = size / 2 - 1.5;
			const outline = [
				...line(x - h, TRACK_Y - h, x + h, TRACK_Y - h),
				...line(x - h, TRACK_Y + h, x + h, TRACK_Y + h),
				...line(x - h, TRACK_Y - h, x - h, TRACK_Y + h),
				...line(x + h, TRACK_Y - h, x + h, TRACK_Y + h),
			];
			const q = size / 4;
			const quadrants = [
				[x - q, TRACK_Y - q],
				[x + q, TRACK_Y - q],
				[x - q, TRACK_Y + q],
				[x + q, TRACK_Y + q],
			] as const;
			square = Math.max(
				square,
				fraction(classes.dark, outline) * fraction(classes.ink, quadrants),
			);
		}
		if (!within(x, TRACK_PEDESTAL_SPAN)) continue;
		const { baseY, baseHalfWidth, bodyY, capY, capHalfWidth } = TRACK_PEDESTAL;
		const base = line(x - baseHalfWidth, baseY, x + baseHalfWidth, baseY);
		const body = line(
			x - baseHalfWidth / 2,
			bodyY,
			x + baseHalfWidth / 2,
			bodyY,
		);
		const cap = line(x - capHalfWidth, capY, x + capHalfWidth, capY);
		pedestal = Math.max(
			pedestal,
			fraction(classes.white, base) *
				fraction(classes.ink, body) *
				fraction(classes.white, cap),
		);
	}
	// a pedestal is the sharper proof (TC backdrops never scored one), so it wins a tie
	const mode =
		pedestal >= TRACK_MARKER_MIN_SCORE
			? "RM"
			: square >= TRACK_MARKER_MIN_SCORE
				? "TC"
				: null;
	return { mode, square, pedestal };
}

const ringOffsets = new Map<number, [number, number][]>();

function offsetsFor(radius: number): [number, number][] {
	let offsets = ringOffsets.get(radius);
	if (!offsets) {
		offsets = Array.from({ length: RING_SAMPLES }, (_, i) => {
			const angle = (2 * Math.PI * i) / RING_SAMPLES;
			return [
				Math.round(radius * Math.cos(angle)),
				Math.round(radius * Math.sin(angle)),
			] as [number, number];
		});
		ringOffsets.set(radius, offsets);
	}
	return offsets;
}

/** Fraction of the rings' samples around (x, y) (frame coordinates) set in `mask`. */
function ringFraction(
	classes: PixelClasses,
	x: number,
	y: number,
	radii: readonly number[],
	mask: Uint8Array,
): number {
	let hits = 0;
	let total = 0;
	for (const radius of radii) {
		for (const [dx, dy] of offsetsFor(radius)) {
			const px = x + dx - classes.x0;
			const py = y + dy - classes.y0;
			total++;
			if (px < 0 || py < 0 || px >= classes.cols || py >= classes.rows) {
				continue;
			}
			hits += mask[py * classes.cols + px]!;
		}
	}
	return hits / total;
}

/** Circular mean hue of the ink samples on a held icon's ring. */
function ringHue(classes: PixelClasses, x: number, y: number): number | null {
	const indices = TRACK_ICON_RING_RADII.flatMap((radius) =>
		offsetsFor(radius).map(
			([dx, dy]) =>
				(y + dy - classes.y0) * classes.cols + (x + dx - classes.x0),
		),
	);
	return meanInkHue(classes, indices);
}

/** Circular mean hue of the ink pixels among `indices`; null when none is ink. */
function meanInkHue(
	classes: PixelClasses,
	indices: Iterable<number>,
): number | null {
	let sin = 0;
	let cos = 0;
	let count = 0;
	for (const index of indices) {
		if (!classes.ink[index]) continue;
		const angle = (classes.hue[index]! * Math.PI) / 180;
		sin += Math.sin(angle);
		cos += Math.cos(angle);
		count++;
	}
	if (count === 0) return null;
	return ((Math.atan2(sin, cos) * 180) / Math.PI + 360) % 360;
}

/** The side whose ink hue sits closest to `hue`, if close enough and closer than the other. */
function nearestSide(
	hue: number,
	teamHues: readonly [number | null, number | null],
): 0 | 1 | null {
	const distances = teamHues.map((teamHue) =>
		teamHue === null ? Number.POSITIVE_INFINITY : hueDistance(hue, teamHue),
	);
	const side: 0 | 1 = distances[0]! <= distances[1]! ? 0 : 1;
	return distances[side]! <= TRACK_ICON_MAX_TEAM_HUE_DIST ? side : null;
}

interface PlateRun {
	value: number;
	confidence: number;
	digits: number;
	/** run center, frame x */
	x: number;
	hue: number | null;
	side: 0 | 1 | null;
	reading: string;
}

/** Every confident digit run in the plate band, each assigned to a side. */
function* readPlates(
	frame: Mat,
	digitSets: readonly GlyphSet[],
	teamHues: readonly [number | null, number | null],
	speculative: boolean,
): MatchSteps<{ score: [BannerScoreRead, BannerScoreRead]; runs: PlateRun[] }> {
	const empty = (reading: string): BannerScoreRead => ({
		value: null,
		confidence: 0,
		digits: 0,
		reading,
	});
	const score: [BannerScoreRead, BannerScoreRead] = [empty(""), empty("")];
	if (digitSets.length === 0) return { score, runs: [] };

	const band = minChannel(frame, TRACK_PLATE_DIGIT_ROI);
	const raws = yield* all(
		digitSets.map((set) =>
			recognizeTextSteps(
				band,
				set,
				{
					binThreshold: TRACK_PLATE_BIN_THRESHOLD,
					spaceGap: Number.POSITIVE_INFINITY,
					minCharScore: 0.3,
				},
				speculative,
			),
		),
	);
	band.delete();

	const runs: PlateRun[] = [];
	for (const [i, set] of digitSets.entries()) {
		const raw = raws[i]!;
		const maxGap = Math.max(
			4,
			Math.round(set.medianWidth * DIGIT_GAP_MAX_RATIO),
		);
		const digits = raw.chars.filter(
			(c) =>
				/^\d$/.test(c.char) &&
				c.score >= TRACK_PLATE_DIGIT_MIN_CONF &&
				c.y1 - c.y0 >= set.height * DIGIT_MIN_HEIGHT_RATIO,
		);
		let group: typeof digits = [];
		const flush = () => {
			if (group.length > 0 && group.length <= 3) {
				const value = Number.parseInt(group.map((c) => c.char).join(""), 10);
				if (value <= MAX_COUNT) {
					const x0 = TRACK_PLATE_DIGIT_ROI.x + group[0]!.x0;
					const x1 = TRACK_PLATE_DIGIT_ROI.x + group.at(-1)!.x1;
					const hue = plateHue(frame, x0, x1);
					const x = (x0 + x1) / 2;
					runs.push({
						value,
						confidence: Math.min(...group.map((c) => c.score)),
						digits: group.length,
						x,
						hue,
						side: plateSide(x, hue, teamHues),
						reading: raw.text,
					});
				}
			}
			group = [];
		};
		for (const c of digits) {
			if (group.length > 0 && c.x0 - group.at(-1)!.x1 > maxGap) flush();
			group.push(c);
		}
		flush();
	}

	for (const run of runs) {
		if (run.side === null) continue;
		const current = score[run.side];
		const better =
			current.value === null ||
			run.digits > current.digits ||
			(run.digits === current.digits && run.confidence > current.confidence);
		if (better) {
			score[run.side] = {
				value: run.value,
				confidence: run.confidence,
				digits: run.digits,
				reading: run.reading,
			};
		}
	}
	return { score, runs };
}

/** Circular mean hue of the plate ink flanking a digit run (the plate body left and right of it). */
function plateHue(frame: Mat, x0: number, x1: number): number | null {
	const roi: Roi = {
		x: Math.max(0, Math.round(x0) - TRACK_PLATE_INK_PAD_X),
		y: TRACK_PLATE_DIGIT_ROI.y,
		w: Math.round(x1 - x0) + 2 * TRACK_PLATE_INK_PAD_X,
		h: TRACK_PLATE_DIGIT_ROI.h,
	};
	const classes = classifyPixels(frame, roi);
	return meanInkHue(classes, classes.ink.keys());
}

/**
 * The side a plate belongs to: by ink when the teams' hues are known, but a
 * side's plate never sits deep in the half the other side pushes into.
 */
function plateSide(
	x: number,
	hue: number | null,
	teamHues: readonly [number | null, number | null],
): 0 | 1 | null {
	const allowed = ([0, 1] as const).filter((candidate) =>
		candidate === 0
			? x >= TRACK_CENTER_X - TRACK_PLATE_CENTER_SLACK
			: x <= TRACK_CENTER_X + TRACK_PLATE_CENTER_SLACK,
	);
	const inked = hue === null ? null : nearestSide(hue, teamHues);
	if (inked !== null) return allowed.includes(inked) ? inked : null;
	// no ink verdict to go on: the position decides when it allows one side only
	const inkUnknown =
		hue === null || teamHues.every((teamHue) => teamHue === null);
	return inkUnknown && allowed.length === 1 ? allowed[0]! : null;
}
