/**
 * PlayerStatus: per-player state off the eight squid/octo icons flanking the
 * timer, emitted alongside each Objective read (same frame, same `time`).
 *
 * Geometry is fitted, not picked: each side's four icons sit at one pitch
 * from an inner icon pinned beside the timer, and the game resizes a side
 * continuously (S3 POV swings it with the objective, a splatted POV player
 * shrinks the strip, spectators toggle views, broadcasts mirror it), through
 * in-between pitches no fixed arrangement fits. Every (pitch, inner center)
 * hypothesis scores how cleanly its four apexes stand out from the backdrop
 * beside them: the apex is the one part of an icon no weapon render, gauge
 * digit or badge covers, and its triangle core lies inside a squid's kite and
 * an octoling's dome alike. The previous read's fit holds unless the best
 * beats it clearly. Camera badges only prove a broadcast (`cast`): a white
 * backdrop under a POV strip fakes them now and then, so they never place it.
 *
 * State reads off the apex core alone, which the wash and the X cover whole:
 * saturated ink of any hue = alive; pale = special ready (the wash pulses from
 * lilac or pink to near-white, but never saturates or greys); else splatted
 * (the dark plate under grey X strokes, or a blown-out backdrop through it).
 */
import { CANONICAL_WIDTH } from "../../canonical";
import type { Mat } from "../../cv";
import { copyRoi, type Roi } from "../../image";
import type { DetectedEvent } from "../types";
import {
	STATUS_ALIVE_MIN_INK,
	STATUS_APEX_RISE,
	STATUS_BAND,
	STATUS_CAST_MIN_DPAD_WHITE,
	STATUS_DARK_MAX_VALUE,
	STATUS_DPAD_PROBES_EVEN,
	STATUS_DPAD_PROBES_NARROW_LEFT,
	STATUS_DPAD_PROBES_NARROW_RIGHT,
	STATUS_FIT_REFINED_SEEDS,
	STATUS_FIT_ROW_STEP,
	STATUS_GAP_WEIGHT,
	STATUS_GREY_MAX_SATURATION,
	STATUS_ICON_CENTER_Y,
	STATUS_INK_MIN_SATURATION,
	STATUS_INK_MIN_VALUE,
	STATUS_INNER_CENTER_RANGES,
	STATUS_PALE_MIN_VALUE,
	STATUS_PITCH_RANGE,
	STATUS_READY_MAX_GREY,
	STATUS_READY_MIN_PALE,
	STATUS_REFERENCE_PITCH,
	STATUS_STICKY_SCORE_RATIO,
	STATUS_TEAM_HUE_ROIS,
	STATUS_TEAM_MAX_HUE_DIST,
	STATUS_TEAM_WEIGHT,
	STATUS_VACANT_BODY,
	STATUS_VACANT_MAX_GREY,
	STATUS_VACANT_MIN_DARK,
	STATUS_WHITE_MAX_SPREAD,
	STATUS_WHITE_MIN_VALUE,
} from "./rois";

export const PLAYER_STATUS_EVENT_TYPE = "PlayerStatus";

const BADGE_ROWS = [
	STATUS_DPAD_PROBES_NARROW_RIGHT,
	STATUS_DPAD_PROBES_NARROW_LEFT,
	STATUS_DPAD_PROBES_EVEN,
];

const PREFIX_FIELDS = 5;

const PITCH_GEOMETRY: PitchGeometry[] = (() => {
	const geometries: PitchGeometry[] = [];
	for (
		let pitch = STATUS_PITCH_RANGE[0];
		pitch <= STATUS_PITCH_RANGE[1];
		pitch++
	) {
		const scale = pitch / STATUS_REFERENCE_PITCH;
		const apex = STATUS_ICON_CENTER_Y - STATUS_APEX_RISE * scale;
		// fit rows land on every STATUS_FIT_ROW_STEP-th band row, the only ones readBand sums
		const rows = (top: number, bottom: number, step = STATUS_FIT_ROW_STEP) => {
			const ys: number[] = [];
			let y = Math.round(apex + top * scale);
			y += (step - ((y - STATUS_BAND.y) % step)) % step;
			for (; y <= apex + bottom * scale; y += step) ys.push(y);
			return ys;
		};
		geometries.push({
			edge: rows(5, 28).flatMap((y) => [
				y,
				Math.floor(y - apex - 3),
				Math.ceil(y - apex + 3),
				Math.floor(y - apex + 9),
			]),
			corners: rows(-2, 12),
			cornerNear: Math.round(0.4 * pitch),
			cornerFar: Math.floor(0.5 * pitch),
			state: rows(8, 26, 1).flatMap((y) => [y, Math.floor(y - apex - 3)]),
		});
	}
	return geometries;
})();

/** Hue of every 5-bit-per-channel color (at its cell's center), for the per-pixel team test. */
const HUE_TABLE = (() => {
	const table = new Uint16Array(1 << 15);
	for (let index = 0; index < table.length; index++) {
		table[index] = Math.round(
			hueOf(
				((index >> 10) << 3) + 4,
				(((index >> 5) & 31) << 3) + 4,
				((index & 31) << 3) + 4,
			),
		);
	}
	return table;
})();

/** Band rows (every STATUS_FIT_ROW_STEP-th from the top) the fit samples: the only ones with prefix sums. */
const FIT_ROWS =
	Math.floor(
		(Math.max(
			...PITCH_GEOMETRY.flatMap(({ edge, corners }) => [
				edge[edge.length - 4]!,
				corners[corners.length - 1]!,
			]),
		) -
			STATUS_BAND.y) /
			STATUS_FIT_ROW_STEP,
	) + 1;

/** Prefix entry of x = 0 on each fit row (indexed by frame y), so lookups skip the row arithmetic. */
const ROW_BASE = (() => {
	const bases = new Int32Array(STATUS_BAND.y + STATUS_BAND.h);
	for (let row = 0; row < FIT_ROWS; row++) {
		bases[STATUS_BAND.y + row * STATUS_FIT_ROW_STEP] =
			row * (STATUS_BAND.w + 1) - STATUS_BAND.x;
	}
	return bases;
})();

export type PlayerStatusFlags = [boolean, boolean, boolean, boolean];

export interface PlayerStatusData {
	/** match timer seconds, same as the paired Objective event's */
	time: number | null;
	/** special held per slot, [left team, right team], slots left-to-right */
	special: [PlayerStatusFlags, PlayerStatusFlags];
	/** splatted per slot, same arrangement */
	dead: [PlayerStatusFlags, PlayerStatusFlags];
	/** true when camera badges proved a cast; never false since badge absence proves nothing */
	cast: true | null;
}

/** One side's fitted strip: slot centers left-to-right at `pitch` from the inner icon. */
interface StripSideFit {
	pitch: number;
	inner: number;
	centers: [number, number, number, number];
}

export type StripFit = [StripSideFit, StripSideFit];

/**
 * Timeline content guard: reads merge only while every slot state matches.
 * `time` (ticks every second) is not compared.
 */
export function samePlayerStatusData(a: unknown, b: unknown): boolean {
	const da = a as PlayerStatusData;
	const db = b as PlayerStatusData;
	for (const side of [0, 1] as const) {
		for (let slot = 0; slot < 4; slot++) {
			if (da.special[side][slot] !== db.special[side][slot]) return false;
			if (da.dead[side][slot] !== db.dead[side][slot]) return false;
		}
	}
	return true;
}

type SlotState = "alive" | "ready" | "dead" | "vacant";

/**
 * Parse the icon strip of a frame the objective gate anchored; emitted only
 * alongside a successful Objective read (its lookalike rejection covers both).
 * `prevFit` (the previous read's, when recent) holds unless clearly beaten.
 */
export function parsePlayerStatus(
	frame: Mat,
	t: number,
	time: number | null,
	prevFit?: StripFit,
): { event: DetectedEvent<PlayerStatusData>; fit: StripFit } {
	const band = readBand(frame);
	const fit = [0, 1].map((side) =>
		fitSide(band, side as 0 | 1, prevFit?.[side]),
	) as StripFit;
	const reads = fit.map((sideFit) =>
		sideFit.centers.map((cx) => readSlot(band, cx, sideFit.pitch)),
	);
	const cast = BADGE_ROWS.some((probes) => badgesVisible(frame, probes));

	return {
		event: {
			type: PLAYER_STATUS_EVENT_TYPE,
			t,
			confidence:
				reads.flat().reduce((sum, read) => sum + read.confidence, 0) / 8,
			data: {
				time,
				special: reads.map((side) =>
					side.map((read) => read.state === "ready"),
				) as PlayerStatusData["special"],
				dead: reads.map((side) =>
					side.map((read) => read.state === "dead"),
				) as PlayerStatusData["dead"],
				cast: cast ? true : null,
			},
			debug: {
				pitches: fit.map((sideFit) => sideFit.pitch),
				centers: fit.map((sideFit) => sideFit.centers),
				apex: reads.flat().map((read) => read.fractions),
			},
		},
		fit,
	};
}

/**
 * The band's pixels plus per-row prefix sums of each channel, the summed
 * squares and team-ink membership, interleaved (PREFIX_FIELDS per entry, row
 * stride `width + 1` entries), so any row segment's color statistics cost one
 * pair of lookups across the few hundred fit hypotheses.
 */
interface Band {
	width: number;
	pixels: Uint8Array;
	channels: number;
	prefix: Int32Array;
}

/**
 * Per-pitch row geometry relative to a slot center: the apex triangle just
 * inside its 45° flanks vs a band just outside them (`edge`: y, inner half
 * width, outer band from/to), the gap corners beside the apex (`corners`: y),
 * outside a kite and a dome alike, and the apex core a state reads off
 * (`state`: y, half width).
 */
interface PitchGeometry {
	edge: number[];
	corners: number[];
	cornerNear: number;
	cornerFar: number;
	state: number[];
}

function readBand(frame: Mat): Band {
	const crop = copyRoi(frame, STATUS_BAND);
	const pixels = new Uint8Array(crop.data);
	const channels = crop.channels();
	crop.delete();
	const width = STATUS_BAND.w;
	const teamHues = [0, 1].map((side) =>
		modalInkHue(pixels, channels, side as 0 | 1),
	);
	const stride = (width + 1) * PREFIX_FIELDS;
	const prefix = new Int32Array(stride * FIT_ROWS);
	const midline = CANONICAL_WIDTH / 2 - STATUS_BAND.x;
	for (let row = 0; row < FIT_ROWS; row++) {
		let o = row * stride;
		const rowStart = row * STATUS_FIT_ROW_STEP * width;
		for (let x = 0; x < width; x++, o += PREFIX_FIELDS) {
			const i = (rowStart + x) * channels;
			const red = pixels[i]!;
			const green = pixels[i + 1]!;
			const blue = pixels[i + 2]!;
			const value = maxOf(red, green, blue);
			const ink =
				value >= STATUS_INK_MIN_VALUE &&
				value - minOf(red, green, blue) >= STATUS_INK_MIN_SATURATION * value;
			const n = o + PREFIX_FIELDS;
			prefix[n] = prefix[o]! + red;
			prefix[n + 1] = prefix[o + 1]! + green;
			prefix[n + 2] = prefix[o + 2]! + blue;
			prefix[n + 3] = prefix[o + 3]! + red * red + green * green + blue * blue;
			prefix[n + 4] =
				prefix[o + 4]! +
				(ink &&
				hueDistance(
					HUE_TABLE[((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3)]!,
					teamHues[x < midline ? 0 : 1]!,
				) <= STATUS_TEAM_MAX_HUE_DIST
					? 1
					: 0);
		}
	}
	return { width, pixels, channels, prefix };
}

/** Modal 10° hue bin of the side's ink pixels: the team's, as icons fill most of the strip. */
function modalInkHue(pixels: Uint8Array, channels: number, side: 0 | 1) {
	const { x: bandX, y: bandY, w: width } = STATUS_BAND;
	const sample = STATUS_TEAM_HUE_ROIS[side];
	const histogram = new Array<number>(36).fill(0);
	for (let y = sample.y; y < sample.y + sample.h; y += 2) {
		for (let x = sample.x; x < sample.x + sample.w; x += 2) {
			const i = ((y - bandY) * width + (x - bandX)) * channels;
			const red = pixels[i]!;
			const green = pixels[i + 1]!;
			const blue = pixels[i + 2]!;
			if (isInk(red, green, blue)) {
				histogram[Math.min(35, Math.floor(hueOf(red, green, blue) / 10))]! += 1;
			}
		}
	}
	let best = 0;
	for (let bin = 1; bin < 36; bin++) {
		if (histogram[bin]! > histogram[best]!) best = bin;
	}
	return best * 10 + 5;
}

/**
 * Best (pitch, inner center) for one side, or `prev` while it scores within
 * STATUS_STICKY_SCORE_RATIO of the best. Searched coarse to fine: every other
 * pitch and center, then each step around the best few (a 1px step shifts
 * the outer apex by 3px, well inside a sample's tolerance).
 */
function fitSide(band: Band, side: 0 | 1, prev?: StripSideFit): StripSideFit {
	const [innerMin, innerMax] = STATUS_INNER_CENTER_RANGES[side];
	const [pitchMin, pitchMax] = STATUS_PITCH_RANGE;
	const scored = new Map<number, Hypothesis>();
	const score = (pitch: number, inner: number): Hypothesis => {
		const key = pitch * 10_000 + inner;
		let hypothesis = scored.get(key);
		if (!hypothesis) {
			hypothesis = {
				pitch,
				inner,
				score: hypothesisScore(band, side, pitch, inner),
			};
			scored.set(key, hypothesis);
		}
		return hypothesis;
	};
	const coarse: Hypothesis[] = [];
	for (let pitch = pitchMin; pitch <= pitchMax; pitch += 2) {
		for (let inner = innerMin; inner <= innerMax; inner += 2) {
			coarse.push(score(pitch, inner));
		}
	}
	let best = coarse[0]!;
	for (const seed of coarse
		.sort((a, b) => b.score - a.score)
		.slice(0, STATUS_FIT_REFINED_SEEDS)) {
		for (let pitch = seed.pitch - 1; pitch <= seed.pitch + 1; pitch++) {
			for (let inner = seed.inner - 1; inner <= seed.inner + 1; inner++) {
				if (
					pitch < pitchMin ||
					pitch > pitchMax ||
					inner < innerMin ||
					inner > innerMax
				)
					continue;
				const candidate = score(pitch, inner);
				if (candidate.score > best.score) best = candidate;
			}
		}
	}
	const kept =
		prev &&
		score(prev.pitch, prev.inner).score >=
			best.score * STATUS_STICKY_SCORE_RATIO
			? prev
			: best;
	return stripSide(side, kept.pitch, kept.inner);
}

interface Hypothesis {
	pitch: number;
	inner: number;
	score: number;
}

function stripSide(side: 0 | 1, pitch: number, inner: number): StripSideFit {
	return {
		pitch,
		inner,
		centers: [0, 1, 2, 3].map((slot) =>
			side === 0 ? inner - (3 - slot) * pitch : inner + slot * pitch,
		) as StripSideFit["centers"],
	};
}

function hypothesisScore(
	band: Band,
	side: 0 | 1,
	pitch: number,
	inner: number,
): number {
	const geometry = PITCH_GEOMETRY[pitch - STATUS_PITCH_RANGE[0]]!;
	let score = 0;
	for (let slot = 0; slot < 4; slot++) {
		score += slotScore(
			band,
			side === 0 ? inner - slot * pitch : inner + slot * pitch,
			geometry,
		);
	}
	return score;
}

/** Apex edge contrast + gap-corner contrast + team ink inside the apex vs beside it. */
function slotScore(band: Band, cx: number, geometry: PitchGeometry): number {
	const edgeIn = newStats();
	const edgeOut = newStats();
	const { edge, corners, cornerNear, cornerFar } = geometry;
	for (let i = 0; i < edge.length; i += 4) {
		const y = edge[i]!;
		const half = edge[i + 1]!;
		addSegment(band, edgeIn, y, cx - half, cx + half);
		addSegment(band, edgeOut, y, cx - edge[i + 3]!, cx - edge[i + 2]!);
		addSegment(band, edgeOut, y, cx + edge[i + 2]!, cx + edge[i + 3]!);
	}
	const cornersOut = newStats();
	for (const y of corners) {
		addSegment(band, cornersOut, y, cx - cornerFar, cx - cornerNear);
		addSegment(band, cornersOut, y, cx + cornerNear, cx + cornerFar);
	}
	return (
		contrast(edgeIn, edgeOut) +
		STATUS_GAP_WEIGHT * contrast(edgeIn, cornersOut) +
		STATUS_TEAM_WEIGHT *
			(edgeIn.team / edgeIn.count - edgeOut.team / edgeOut.count)
	);
}

interface SegmentStats {
	count: number;
	r: number;
	g: number;
	b: number;
	squares: number;
	team: number;
}

function newStats(): SegmentStats {
	return { count: 0, r: 0, g: 0, b: 0, squares: 0, team: 0 };
}

/** Adds the inclusive row segment [x0, x1] at y (frame coordinates). */
function addSegment(
	band: Band,
	stats: SegmentStats,
	y: number,
	x0: number,
	x1: number,
): void {
	if (x1 < x0) return;
	const { prefix } = band;
	const row = ROW_BASE[y]!;
	const from = (row + x0) * PREFIX_FIELDS;
	const to = (row + x1 + 1) * PREFIX_FIELDS;
	stats.count += x1 - x0 + 1;
	stats.r += prefix[to]! - prefix[from]!;
	stats.g += prefix[to + 1]! - prefix[from + 1]!;
	stats.b += prefix[to + 2]! - prefix[from + 2]!;
	stats.squares += prefix[to + 3]! - prefix[from + 3]!;
	stats.team += prefix[to + 4]! - prefix[from + 4]!;
}

/** Mean color distance over the pooled spread: high only where two flat regions meet. */
function contrast(a: SegmentStats, b: SegmentStats): number {
	const ar = a.r / a.count;
	const ag = a.g / a.count;
	const ab = a.b / a.count;
	const br = b.r / b.count;
	const bg = b.g / b.count;
	const bb = b.b / b.count;
	const spreadA = Math.sqrt(
		Math.max(0, a.squares / a.count - ar * ar - ag * ag - ab * ab),
	);
	const spreadB = Math.sqrt(
		Math.max(0, b.squares / b.count - br * br - bg * bg - bb * bb),
	);
	return Math.hypot(ar - br, ag - bg, ab - bb) / (spreadA + spreadB + 10);
}

/**
 * State from the apex core's ink / pale / grey fractions; confidence scales
 * with the deciding fraction (1 at twice its threshold).
 */
function readSlot(
	band: Band,
	cx: number,
	pitch: number,
): {
	state: SlotState;
	confidence: number;
	fractions: [number, number, number];
} {
	const { state: rows } = PITCH_GEOMETRY[pitch - STATUS_PITCH_RANGE[0]]!;
	let ink = 0;
	let pale = 0;
	let grey = 0;
	let count = 0;
	for (let row = 0; row < rows.length; row += 2) {
		const y = rows[row]!;
		const half = rows[row + 1]!;
		for (let x = cx - half; x <= cx + half; x++) {
			const i =
				((y - STATUS_BAND.y) * band.width + (x - STATUS_BAND.x)) *
				band.channels;
			const red = band.pixels[i]!;
			const green = band.pixels[i + 1]!;
			const blue = band.pixels[i + 2]!;
			const value = maxOf(red, green, blue);
			const saturation = value ? (value - minOf(red, green, blue)) / value : 0;
			if (isInk(red, green, blue)) ink++;
			else if (value >= STATUS_PALE_MIN_VALUE) pale++;
			else if (
				value <= STATUS_DARK_MAX_VALUE ||
				saturation <= STATUS_GREY_MAX_SATURATION
			)
				grey++;
			count++;
		}
	}
	const fractions: [number, number, number] = [
		ink / count,
		pale / count,
		grey / count,
	];
	const [inkShare, paleShare, greyShare] = fractions;
	if (inkShare >= STATUS_ALIVE_MIN_INK) {
		return {
			state: "alive",
			confidence: Math.min(1, inkShare / (2 * STATUS_ALIVE_MIN_INK)),
			fractions,
		};
	}
	if (
		paleShare >= STATUS_READY_MIN_PALE &&
		greyShare <= STATUS_READY_MAX_GREY
	) {
		return {
			state: "ready",
			confidence: Math.min(1, paleShare / (2 * STATUS_READY_MIN_PALE)),
			fractions,
		};
	}
	return {
		state: isVacant(band, cx, pitch) ? "vacant" : "dead",
		confidence: Math.min(1, greyShare / (2 * STATUS_READY_MAX_GREY)),
		fractions,
	};
}

/**
 * An empty seat (a 1v1 lobby, a disconnected player) draws an opaque black
 * squid: no X strokes, no greyed weapon render, which every splat shows.
 */
function isVacant(band: Band, cx: number, pitch: number): boolean {
	const scale = pitch / STATUS_REFERENCE_PITCH;
	const half = Math.round(STATUS_VACANT_BODY.halfWidth * scale);
	let dark = 0;
	let grey = 0;
	let count = 0;
	for (
		let y = Math.round(STATUS_ICON_CENTER_Y + STATUS_VACANT_BODY.top * scale);
		y <= STATUS_ICON_CENTER_Y + STATUS_VACANT_BODY.bottom * scale;
		y++
	) {
		for (let x = cx - half; x <= cx + half; x++) {
			const i =
				((y - STATUS_BAND.y) * band.width + (x - STATUS_BAND.x)) *
				band.channels;
			const red = band.pixels[i]!;
			const green = band.pixels[i + 1]!;
			const blue = band.pixels[i + 2]!;
			const value = maxOf(red, green, blue);
			if (value <= STATUS_DARK_MAX_VALUE) dark++;
			else if (
				value - minOf(red, green, blue) <=
				STATUS_GREY_MAX_SATURATION * value
			)
				grey++;
			count++;
		}
	}
	return (
		dark / count >= STATUS_VACANT_MIN_DARK &&
		grey / count < STATUS_VACANT_MAX_GREY
	);
}

function isInk(red: number, green: number, blue: number): boolean {
	const value = maxOf(red, green, blue);
	return (
		value >= STATUS_INK_MIN_VALUE &&
		value - minOf(red, green, blue) >= STATUS_INK_MIN_SATURATION * value
	);
}

function maxOf(red: number, green: number, blue: number): number {
	return red > green ? (red > blue ? red : blue) : green > blue ? green : blue;
}

function minOf(red: number, green: number, blue: number): number {
	return red < green ? (red < blue ? red : blue) : green < blue ? green : blue;
}

function hueOf(red: number, green: number, blue: number): number {
	const value = maxOf(red, green, blue);
	const delta = value - minOf(red, green, blue);
	if (delta === 0) return 0;
	const sector =
		value === red
			? ((green - blue) / delta + 6) % 6
			: value === green
				? (blue - red) / delta + 2
				: (red - green) / delta + 4;
	return sector * 60;
}

function hueDistance(a: number, b: number): number {
	const d = a > b ? a - b : b - a;
	return d > 180 ? 360 - d : d;
}

/** All four badge probes reading white = that casted spectator arrangement. */
function badgesVisible(frame: Mat, probes: readonly Roi[]): boolean {
	return probes.every((roi) => {
		const crop = copyRoi(frame, roi);
		const { data } = crop;
		const channels = crop.channels();
		let white = 0;
		let count = 0;
		for (let i = 0; i < data.length; i += channels) {
			const value = Math.max(data[i]!, data[i + 1]!, data[i + 2]!);
			if (
				value >= STATUS_WHITE_MIN_VALUE &&
				value - Math.min(data[i]!, data[i + 1]!, data[i + 2]!) <=
					STATUS_WHITE_MAX_SPREAD
			) {
				white++;
			}
			count++;
		}
		crop.delete();
		return white / count >= STATUS_CAST_MIN_DPAD_WHITE;
	});
}
