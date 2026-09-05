/**
 * PlayerStatus: per-player state off the eight squid/octo icons flanking the
 * timer, emitted alongside each Objective read (same frame, same `time`).
 * Three pixel-class fractions decide a slot (calibration in rois.ts): alive =
 * saturated team-ink body; special held = bright pale wash that PULSES (bright
 * frames light the shoulder probe, trough frames only read pale); splatted =
 * unsaturated grey X with none of the three. Three geometries, named by which
 * side sits at the packed pitch: "even", "narrow-right" (usual spectator HUD;
 * S3 POV draws it too) and "narrow-left" (right column nearly coincides with
 * even's). Camera badges prove a broadcast, but broadcasts can hide them, so a
 * badge-less frame picks the geometry reading more decisively, with a slot-comb
 * win proving narrow-left and a history-less near-tie staying narrow-right
 * (pickLayout). On narrow layouts only the unsaturated glow counts toward ready
 * so saturated backdrop leaks cannot fake or suppress a state.
 */
import type { Mat } from "../../cv";
import { copyRoi, type Roi } from "../../image";
import type { DetectedEvent } from "../types";
import {
	STATUS_BODY_BOX_EVEN,
	STATUS_BODY_BOX_NARROW,
	STATUS_CAST_MIN_DPAD_WHITE,
	STATUS_COMB_BAND_H,
	STATUS_COMB_BAND_Y,
	STATUS_COMB_CENTER_HALF_WIDTH,
	STATUS_COMB_GAP_HALF_WIDTH,
	STATUS_COMB_MAX_SHIFT,
	STATUS_COMB_SIDE_SPANS,
	STATUS_DEAD_MAX_BODY_INK,
	STATUS_DEAD_MAX_BODY_PALE,
	STATUS_DEAD_MAX_SHOULDER_GLOW,
	STATUS_DPAD_PROBES_NARROW_LEFT,
	STATUS_DPAD_PROBES_NARROW_RIGHT,
	STATUS_FRESH_EVEN_MIN_LEAD,
	STATUS_FRESH_NARROW_LEFT_MIN_LEFT_LEAD,
	STATUS_FRESH_NARROW_LEFT_RIVAL_COMB_VETO,
	STATUS_FRESH_NARROW_RIGHT_MIN_DECISIVENESS,
	STATUS_GLOW_MAX_SPREAD,
	STATUS_GLOW_MIN_VALUE,
	STATUS_INK_MIN_SPREAD,
	STATUS_INK_MIN_VALUE,
	STATUS_LAYOUT_SCORE_CAP,
	STATUS_LAYOUT_STICKY_MARGIN,
	STATUS_NARROW_LEFT_COMB_LEAD,
	STATUS_NARROW_LEFT_COMB_MIN,
	STATUS_PALE_MAX_SPREAD,
	STATUS_PALE_MIN_VALUE,
	STATUS_READY_CLEAN_WASH_MAX_BODY_INK,
	STATUS_READY_INKY_WASH_MIN_BODY_PALE,
	STATUS_READY_MIN_BODY_PALE,
	STATUS_READY_MIN_SHOULDER_GLOW,
	STATUS_READY_MIN_WASH_BODY_PALE,
	STATUS_READY_WASH_MAX_BODY_INK,
	STATUS_SHOULDER_BOX_EVEN,
	STATUS_SHOULDER_BOX_NARROW,
	STATUS_SLOT_CENTERS_EVEN,
	STATUS_SLOT_CENTERS_NARROW_LEFT,
	STATUS_SLOT_CENTERS_NARROW_RIGHT,
	STATUS_STICKY_FLIP_COMB_MIN,
	STATUS_WHITE_MAX_SPREAD,
	STATUS_WHITE_MIN_VALUE,
} from "./rois";

export const PLAYER_STATUS_EVENT_TYPE = "PlayerStatus";

export type PlayerStatusFlags = [boolean, boolean, boolean, boolean];

export type PlayerStatusLayout = "even" | "narrow-right" | "narrow-left";

export interface PlayerStatusData {
	/** match timer seconds, same as the paired Objective event's */
	time: number | null;
	/** special held per slot, [left team, right team], slots left-to-right */
	special: [PlayerStatusFlags, PlayerStatusFlags];
	/** splatted per slot, same arrangement */
	dead: [PlayerStatusFlags, PlayerStatusFlags];
	/**
	 * strip geometry, named by which side sits at the packed ~76px pitch ("even"
	 * = both at ~99px). Pure geometry, never footage type: S3 POV draws both
	 * narrow arrangements (2026-08-11 Um'ami VoD = narrow-right, 2026-08-22
	 * Sendou VoD = narrow-left), so only `cast` is broadcast evidence
	 */
	layout: PlayerStatusLayout;
	/** true when camera badges proved a cast; never false since badge absence proves nothing */
	cast: true | null;
}

/**
 * Timeline content guard: reads merge only while every slot state matches.
 * `time` (ticks every second) and `layout` (same states = same state) are not compared.
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

interface SlotRead {
	dead: boolean;
	special: boolean;
	confidence: number;
	bodyInk: number;
	bodyPale: number;
	shoulderGlow: number;
	shoulderPaleGlow: number;
}

/**
 * Parse the icon strip of a frame the objective gate anchored; emitted only
 * alongside a successful Objective read (its lookalike rejection covers both).
 * `prevLayout` is sticky: a badge-less frame only switches geometry on a clear
 * decisiveness margin, since a busy scene can nudge the score.
 */
export function parsePlayerStatus(
	frame: Mat,
	t: number,
	time: number | null,
	prevLayout?: PlayerStatusLayout,
): DetectedEvent<PlayerStatusData> {
	const { layout, scores } = pickLayout(frame, prevLayout);
	const sides = readSlots(frame, layout);

	const reads = sides.flat();
	return {
		type: PLAYER_STATUS_EVENT_TYPE,
		t,
		confidence:
			reads.reduce((sum, read) => sum + read.confidence, 0) / reads.length,
		data: {
			time,
			special: sides.map((side) =>
				side.map((read) => read.special),
			) as PlayerStatusData["special"],
			dead: sides.map((side) =>
				side.map((read) => read.dead),
			) as PlayerStatusData["dead"],
			layout,
			cast: scores === null ? true : null,
		},
		debug: {
			layout,
			layoutScores: scores
				? Object.fromEntries(
						Object.entries(scores).map(([name, score]) => [
							name,
							Number(score.toFixed(3)),
						]),
					)
				: "badges",
			bodyInk: reads.map((read) => Number(read.bodyInk.toFixed(2))),
			bodyPale: reads.map((read) => Number(read.bodyPale.toFixed(2))),
			shoulderGlow: reads.map((read) => Number(read.shoulderGlow.toFixed(2))),
			shoulderPaleGlow: reads.map((read) =>
				Number(read.shoulderPaleGlow.toFixed(2)),
			),
		},
	};
}

function readSlots(
	frame: Mat,
	layout: PlayerStatusLayout,
): [SlotRead[], SlotRead[]] {
	const centers =
		layout === "even"
			? STATUS_SLOT_CENTERS_EVEN
			: layout === "narrow-right"
				? STATUS_SLOT_CENTERS_NARROW_RIGHT
				: STATUS_SLOT_CENTERS_NARROW_LEFT;
	const shoulderBox =
		layout === "even" ? STATUS_SHOULDER_BOX_EVEN : STATUS_SHOULDER_BOX_NARROW;
	const bodyBox =
		layout === "even" ? STATUS_BODY_BOX_EVEN : STATUS_BODY_BOX_NARROW;

	return centers.map((sideCenters) =>
		sideCenters.map((cx): SlotRead => {
			const shoulder = classFractions(frame, {
				x: cx + shoulderBox.dx,
				y: shoulderBox.y,
				w: shoulderBox.w,
				h: shoulderBox.h,
			});
			const body = classFractions(frame, {
				x: cx + bodyBox.dx,
				y: bodyBox.y,
				w: bodyBox.w,
				h: bodyBox.h,
			});
			return classifySlot(
				body.ink,
				body.pale,
				shoulder.glow,
				shoulder.paleGlow,
				layout,
			);
		}),
	) as [SlotRead[], SlotRead[]];
}

const ALL_LAYOUTS: readonly PlayerStatusLayout[] = [
	"even",
	"narrow-right",
	"narrow-left",
];

/**
 * Layouts a badge-less frame may flip to on score alone. Decisiveness cannot
 * tell even from narrow-left (right columns coincide); a wrong even pick on a
 * broadcast self-heals at the next badge frame while a wrong narrow-left on POV
 * never would, so narrow-left is only reachable via badges or from an
 * established narrow-right (specced POV switching teams, AREA CUP VoD). A fresh
 * frame may still open narrow-left through the left-column gate (pickLayout).
 */
const SCORED_FLIPS: Record<PlayerStatusLayout, readonly PlayerStatusLayout[]> =
	{
		even: ["narrow-right"],
		"narrow-right": ["even", "narrow-left"],
		"narrow-left": ["narrow-right"],
	};

/**
 * Badges prove an arrangement outright. Badge-less frames are NOT proven even,
 * so geometries are scored by how decisively body reads land on either side of
 * the dead threshold: a mispicked geometry puts outer boxes on backdrop, which
 * reads mid-range ink. Featureless dark backdrop still reads "decisively dead",
 * so the sticky margin stops one noisy frame flipping an established layout and
 * SCORED_FLIPS keeps the even/narrow-left false friends from trading places.
 * Three decisions decisiveness cannot make alone:
 * - badge-less narrow-left (sendou-triton VoD) scores below narrow-right even
 *   when true, so a decisive slot-comb win (combContrast) overrides all but
 *   badges — positional, so only the differing left columns can lead;
 * - a history-less even-vs-narrow-right near-tie stays narrow-right unless it
 *   reads under the floor or even leads decisively (STATUS_FRESH_*);
 * - badge-less narrow-left POV over pale backdrops (2026-08-22 Sendou VoD)
 *   drowns the comb, so a fresh narrow-left pick may also come from the left
 *   column winning decisiveness, vetoed by a readable rival left comb
 *   (STATUS_FRESH_NARROW_LEFT_*).
 */
function pickLayout(
	frame: Mat,
	prevLayout: PlayerStatusLayout | undefined,
): {
	layout: PlayerStatusLayout;
	scores: Record<PlayerStatusLayout, number> | null;
} {
	if (badgesVisible(frame, STATUS_DPAD_PROBES_NARROW_RIGHT))
		return { layout: "narrow-right", scores: null };
	if (badgesVisible(frame, STATUS_DPAD_PROBES_NARROW_LEFT))
		return { layout: "narrow-left", scores: null };
	const sideScores = Object.fromEntries(
		ALL_LAYOUTS.map((layout) => [
			layout,
			readSlots(frame, layout).map(sideDecisiveness) as [number, number],
		]),
	) as Record<PlayerStatusLayout, [number, number]>;
	const scores = Object.fromEntries(
		ALL_LAYOUTS.map((layout) => [
			layout,
			(sideScores[layout][0] + sideScores[layout][1]) / 2,
		]),
	) as Record<PlayerStatusLayout, number>;
	const sideCombs = combScores(frame);
	const combs = Object.fromEntries(
		ALL_LAYOUTS.map((layout) => [
			layout,
			sideCombs[layout][0] + sideCombs[layout][1],
		]),
	) as Record<PlayerStatusLayout, number>;
	if (
		combs["narrow-left"] >= STATUS_NARROW_LEFT_COMB_MIN &&
		combs["narrow-left"] >=
			combs["narrow-right"] + STATUS_NARROW_LEFT_COMB_LEAD &&
		combs["narrow-left"] >= combs.even + STATUS_NARROW_LEFT_COMB_LEAD
	) {
		return { layout: "narrow-left", scores };
	}
	if (prevLayout) {
		// flips away from narrow-right also need comb corroboration: on S3 POV the
		// strip shrinks toward the timer while the POV player is dead, spiking the
		// challenger past the sticky margin (2026-08-11 VoD locked into narrow-left)
		const challengers = SCORED_FLIPS[prevLayout].filter(
			(layout) =>
				prevLayout !== "narrow-right" ||
				(combs[layout] >= STATUS_STICKY_FLIP_COMB_MIN &&
					combs[layout] >=
						combs["narrow-right"] + STATUS_NARROW_LEFT_COMB_LEAD),
		);
		const challenger =
			challengers.length > 0
				? challengers.reduce((a, b) => (scores[b] > scores[a] ? b : a))
				: null;
		return {
			layout:
				challenger !== null &&
				scores[challenger] > scores[prevLayout] + STATUS_LAYOUT_STICKY_MARGIN
					? challenger
					: prevLayout,
			scores,
		};
	}
	if (
		scores["narrow-left"] > scores.even &&
		scores["narrow-left"] > scores["narrow-right"] &&
		sideScores["narrow-left"][0] >=
			Math.max(sideScores.even[0], sideScores["narrow-right"][0]) +
				STATUS_FRESH_NARROW_LEFT_MIN_LEFT_LEAD &&
		Math.max(sideCombs.even[0], sideCombs["narrow-right"][0]) <
			STATUS_FRESH_NARROW_LEFT_RIVAL_COMB_VETO
	) {
		return { layout: "narrow-left", scores };
	}
	if (
		scores["narrow-right"] >= STATUS_FRESH_NARROW_RIGHT_MIN_DECISIVENESS &&
		scores.even < scores["narrow-right"] + STATUS_FRESH_EVEN_MIN_LEAD
	) {
		return { layout: "narrow-right", scores };
	}
	return {
		layout: scores.even >= scores["narrow-right"] ? "even" : "narrow-right",
		scores,
	};
}

function sideDecisiveness(reads: SlotRead[]): number {
	return (
		reads.reduce(
			(sum, read) =>
				sum +
				Math.min(
					Math.abs(read.bodyInk - STATUS_DEAD_MAX_BODY_INK),
					STATUS_LAYOUT_SCORE_CAP,
				),
			0,
		) / reads.length
	);
}

/**
 * State from the class fractions; confidence scales with distance to the
 * nearest boundary (1 at twice the threshold / at zero). On narrow layouts the
 * wash replaces the body's ink, so an ink-heavy body means backdrop leak unless
 * strongly pale too (graded STATUS_READY_*WASH* guards), and only unsaturated
 * glow counts (STATUS_GLOW_MAX_SPREAD). A pale backdrop can still light a DEAD
 * icon's shoulder, so narrow ready reads also need the wash's pale body and the
 * narrow dead read trusts the body classes alone.
 */
function classifySlot(
	bodyInk: number,
	bodyPale: number,
	shoulderGlow: number,
	shoulderPaleGlow: number,
	layout: PlayerStatusLayout,
): SlotRead {
	const washGlow = layout === "even" ? shoulderGlow : shoulderPaleGlow;
	const dead =
		bodyInk <= STATUS_DEAD_MAX_BODY_INK &&
		(layout !== "even" || washGlow <= STATUS_DEAD_MAX_SHOULDER_GLOW) &&
		bodyPale <= STATUS_DEAD_MAX_BODY_PALE;
	const washedBody =
		bodyInk <= STATUS_READY_CLEAN_WASH_MAX_BODY_INK ||
		(bodyInk <= STATUS_READY_WASH_MAX_BODY_INK &&
			bodyPale >= STATUS_READY_INKY_WASH_MIN_BODY_PALE);
	const special =
		!dead &&
		(washGlow >= STATUS_READY_MIN_SHOULDER_GLOW ||
			bodyPale >= STATUS_READY_MIN_BODY_PALE) &&
		(layout === "even" ||
			(washedBody && bodyPale >= STATUS_READY_MIN_WASH_BODY_PALE));
	const confidence = dead
		? Math.min(
				1,
				(STATUS_DEAD_MAX_BODY_INK - bodyInk) / STATUS_DEAD_MAX_BODY_INK,
			)
		: special
			? Math.min(
					1,
					Math.max(
						washGlow / (STATUS_READY_MIN_SHOULDER_GLOW * 2),
						bodyPale / (STATUS_READY_MIN_BODY_PALE * 2),
					),
				)
			: Math.min(1, bodyInk / (STATUS_DEAD_MAX_BODY_INK * 2));
	return {
		dead,
		special,
		confidence,
		bodyInk,
		bodyPale,
		shoulderGlow,
		shoulderPaleGlow,
	};
}

/** Ink, glow, and pale pixel fractions of a ROI (see rois.ts for the classes). */
function classFractions(
	frame: Mat,
	roi: Roi,
): { ink: number; glow: number; paleGlow: number; pale: number } {
	const crop = copyRoi(frame, roi);
	const { data } = crop;
	const channels = crop.channels();
	let ink = 0;
	let glow = 0;
	let paleGlow = 0;
	let pale = 0;
	let count = 0;
	for (let i = 0; i < data.length; i += channels) {
		const r = data[i]!;
		const g = data[i + 1]!;
		const b = data[i + 2]!;
		const value = Math.max(r, g, b);
		const spread = value - Math.min(r, g, b);
		if (spread >= STATUS_INK_MIN_SPREAD && value >= STATUS_INK_MIN_VALUE) ink++;
		if (value >= STATUS_GLOW_MIN_VALUE) {
			glow++;
			if (spread <= STATUS_GLOW_MAX_SPREAD) paleGlow++;
		}
		if (value >= STATUS_PALE_MIN_VALUE && spread <= STATUS_PALE_MAX_SPREAD)
			pale++;
		count++;
	}
	crop.delete();
	return {
		ink: ink / count,
		glow: glow / count,
		paleGlow: paleGlow / count,
		pale: pale / count,
	};
}

/**
 * Slot-comb contrast per layout and side: mean iconness (ink-or-pale column
 * fraction) at slot centers minus at gap midpoints, maximized over a small
 * shift. A rigid comb at the wrong pitch cannot score all four slots at once:
 * positional evidence orthogonal to body decisiveness (STATUS_NARROW_LEFT_COMB_*).
 */
function combScores(frame: Mat): Record<PlayerStatusLayout, [number, number]> {
	const profiles = STATUS_COMB_SIDE_SPANS.map(([x0, x1]) =>
		iconnessProfile(frame, x0, x1),
	);
	const centersOf = (layout: PlayerStatusLayout) =>
		layout === "even"
			? STATUS_SLOT_CENTERS_EVEN
			: layout === "narrow-right"
				? STATUS_SLOT_CENTERS_NARROW_RIGHT
				: STATUS_SLOT_CENTERS_NARROW_LEFT;
	return Object.fromEntries(
		ALL_LAYOUTS.map((layout) => [
			layout,
			centersOf(layout).map((sideCenters, side) =>
				combContrast(
					profiles[side]!,
					STATUS_COMB_SIDE_SPANS[side]![0],
					sideCenters,
				),
			) as [number, number],
		]),
	) as Record<PlayerStatusLayout, [number, number]>;
}

function iconnessProfile(frame: Mat, x0: number, x1: number): number[] {
	const crop = copyRoi(frame, {
		x: x0,
		y: STATUS_COMB_BAND_Y,
		w: x1 - x0,
		h: STATUS_COMB_BAND_H,
	});
	const { data } = crop;
	const channels = crop.channels();
	const width = crop.cols;
	const height = crop.rows;
	const profile = new Array<number>(width).fill(0);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * channels;
			const r = data[i]!;
			const g = data[i + 1]!;
			const b = data[i + 2]!;
			const value = Math.max(r, g, b);
			const spread = value - Math.min(r, g, b);
			const isInk =
				spread >= STATUS_INK_MIN_SPREAD && value >= STATUS_INK_MIN_VALUE;
			const isPale =
				value >= STATUS_PALE_MIN_VALUE && spread <= STATUS_PALE_MAX_SPREAD;
			if (isInk || isPale) profile[x]! += 1 / height;
		}
	}
	crop.delete();
	return profile;
}

function combContrast(
	profile: number[],
	x0: number,
	centers: readonly number[],
): number {
	let best = -1;
	for (
		let shift = -STATUS_COMB_MAX_SHIFT;
		shift <= STATUS_COMB_MAX_SHIFT;
		shift += 2
	) {
		let onCenters = 0;
		for (const cx of centers)
			onCenters += bandMean(
				profile,
				x0,
				cx + shift,
				STATUS_COMB_CENTER_HALF_WIDTH,
			);
		onCenters /= centers.length;
		let onGaps = 0;
		for (let i = 0; i < centers.length - 1; i++) {
			const mid = Math.round((centers[i]! + centers[i + 1]!) / 2);
			onGaps += bandMean(profile, x0, mid + shift, STATUS_COMB_GAP_HALF_WIDTH);
		}
		onGaps /= centers.length - 1;
		best = Math.max(best, onCenters - onGaps);
	}
	return best;
}

function bandMean(
	profile: number[],
	x0: number,
	center: number,
	halfWidth: number,
): number {
	let sum = 0;
	let count = 0;
	for (let x = center - halfWidth; x <= center + halfWidth; x++) {
		const i = x - x0;
		if (i < 0 || i >= profile.length) continue;
		sum += profile[i]!;
		count++;
	}
	return count ? sum / count : 0;
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
			const r = data[i]!;
			const g = data[i + 1]!;
			const b = data[i + 2]!;
			const value = Math.max(r, g, b);
			if (
				value >= STATUS_WHITE_MIN_VALUE &&
				value - Math.min(r, g, b) <= STATUS_WHITE_MAX_SPREAD
			) {
				white++;
			}
			count++;
		}
		crop.delete();
		return white / count >= STATUS_CAST_MIN_DPAD_WHITE;
	});
}
