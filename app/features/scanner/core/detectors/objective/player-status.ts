/**
 * PlayerStatus: the per-player state read off the eight squid/octo icons
 * flanking the match timer, emitted by the ObjectiveDetector alongside each
 * Objective read (same frame, same `time`, so callers can pair the two).
 *
 * Per slot, three pixel-class fractions decide the state (rois.ts documents
 * the calibration): an alive icon's body is saturated team ink; holding
 * special washes the body into a bright pale glow that PULSES — bright
 * frames light the shoulder probe past the glow floor, trough frames only
 * read as pale — and a splatted icon is an unsaturated grey/dark X with
 * none of the three. Three strip geometries exist, named by which side
 * sits at the packed pitch: "even", "narrow-right" (the casted spectator
 * HUD's usual arrangement — S3 POV footage draws it too) and its mirror
 * "narrow-left" (whose right column nearly coincides with even's). White
 * camera badges under the right team prove a broadcast outright, but
 * broadcasts can hide them while keeping their geometry, so a badge-less
 * frame picks whichever geometry reads more decisively (bodies far from
 * the dead threshold on either side) instead of assuming even — with two
 * positional refinements: a decisive slot-comb win proves badge-less
 * narrow-left outright, and a history-less near-tie stays with
 * narrow-right (see pickLayout). The spectator wash glow is pale, so on
 * the narrow layouts only the unsaturated glow fraction counts toward
 * ready (and against dead) — saturated backdrop leaking over a dead
 * icon's shoulder cannot fake or suppress a state.
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
	/**
	 * seconds shown on the match timer at the read, same value as the
	 * Objective event from the same frame — the key for pairing the two
	 */
	time: number | null;
	/** special held per slot, [left team, right team], slots left-to-right */
	special: [PlayerStatusFlags, PlayerStatusFlags];
	/** splatted per slot, same arrangement */
	dead: [PlayerStatusFlags, PlayerStatusFlags];
	/**
	 * which icon-strip geometry the frame showed, named by which side's
	 * icons sit at the packed ~76px pitch ("even" = both sides at the wide
	 * ~99px pitch). Pure geometry, never footage type: S3 first-person POV
	 * footage draws both narrow arrangements in steady state (the
	 * 2026-08-11 Um'ami VoD measures identical to narrow-right, the
	 * 2026-08-22 Sendou VoD to narrow-left), so only `cast` is broadcast
	 * evidence
	 */
	layout: PlayerStatusLayout;
	/**
	 * true when the white camera badges proved a casted spectator HUD on
	 * this frame; null otherwise — badge absence proves nothing (broadcasts
	 * can hide them while keeping the geometry), so this never reads false
	 */
	cast: true | null;
}

/**
 * Timeline content guard: reads merge only while every slot state matches,
 * so each death/respawn/special flip becomes its own event. `time` is not
 * compared (it ticks every second) and neither is `layout` (a camera-style
 * change with identical states is the same state).
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
 * Parse the icon strip of a frame the objective gate already anchored as
 * the in-match counter HUD. Callers emit the event only alongside a
 * successful Objective read — the counter parse carries the lookalike
 * rejection for both. `prevLayout` is the layout of the caller's previous
 * read (sticky: a badge-less frame only switches geometry when the other
 * layout wins the decisiveness score by a clear margin — the footage type
 * does not flip frame to frame, but a busy scene can nudge the score).
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
 * Which layouts a badge-less frame may flip to from an established one on
 * score alone. The narrow-left right column nearly coincides with even's,
 * so decisiveness cannot tell those two apart — and a wrong even pick on
 * broadcast footage self-heals (the next badge frame proves the
 * arrangement) while a wrong narrow-left pick on POV footage never would
 * (POV footage shows no badges). So on score alone narrow-left is only
 * reachable via badges or from an established narrow-right (the specced
 * POV switching teams mid-game, attested in the AREA CUP VoD's badge-less
 * overhead stretches); a fresh history-less frame may still open on
 * narrow-left through the left-column gate (see pickLayout).
 */
const SCORED_FLIPS: Record<PlayerStatusLayout, readonly PlayerStatusLayout[]> =
	{
		even: ["narrow-right"],
		"narrow-right": ["even", "narrow-left"],
		"narrow-left": ["narrow-right"],
	};

/**
 * Camera badges prove a broadcast arrangement outright (each arrangement
 * has its own badge columns). Badge-less frames are NOT proven even —
 * broadcasts can hide the badges while keeping their icon geometry — so
 * the candidate geometries are scored and the one whose body reads land
 * decisively on either side of the dead threshold wins. A mispicked
 * geometry puts outer-slot boxes between icons or on backdrop, which reads
 * mid-range ink — exactly what the score punishes; boxes on featureless
 * dark backdrop still read "decisively dead" though, so a busy scene can
 * nudge a frame's score across — the sticky margin keeps a single noisy
 * frame from flipping an established layout, and SCORED_FLIPS keeps the
 * even/narrow-left false friends from ever trading places without badge
 * proof.
 *
 * Three decisions decisiveness cannot make on its own:
 * - Badge-less narrow-left (attested in the sendou-triton VoD) scores
 *   below narrow-right even on true narrow-left frames, so a decisive
 *   slot-comb win (see combContrast) overrides everything but badges —
 *   comb evidence is positional and cannot confuse the even/narrow-left
 *   false friends because only their differing left columns can produce a
 *   decisive lead.
 * - A history-less even-vs-narrow-right near-tie (busy backdrops mis-rank
 *   broadcast footage): the fresh pick stays narrow-right unless it reads
 *   under the floor or even leads decisively (STATUS_FRESH_* in rois.ts).
 * - Steady-state badge-less narrow-left POV footage over pale backdrops
 *   (the 2026-08-22 Sendou POV VoD) drowns the comb — gaps read as
 *   iconness — so a fresh narrow-left pick may also come from the left
 *   column, the only one where narrow-left and even differ, winning the
 *   per-side decisiveness outright, with a readable rival left comb as
 *   the veto (STATUS_FRESH_NARROW_LEFT_* in rois.ts).
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
		// flips away from narrow-right additionally need positional
		// corroboration: S3 POV footage draws that geometry, but while the
		// POV player is dead the strip shrinks toward the timer and those
		// transient frames spike the challenger decisiveness past the sticky
		// margin (the 2026-08-11 POV VoD locked into narrow-left that way) —
		// a real arrangement change moves the slot comb with it, a shrink
		// does not
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
 * State from the pixel-class fractions, with a confidence scaled by the
 * distance to the nearest decision boundary (1 at twice the threshold / at
 * zero). On the narrow layouts a ready icon is always the wash, which
 * replaces the body's team ink — an ink-heavy body there means the bright
 * read is backdrop leaking past the icon edge, not a held special, unless
 * the body also reads strongly pale (the graded STATUS_READY_*WASH*
 * guards) — and the wash glow is pale, so only the
 * unsaturated glow fraction counts (a saturated bright leak, like sky over
 * a dead icon's shoulder, is not a wash — see STATUS_GLOW_MAX_SPREAD).
 * A pale backdrop can still light a DEAD icon's shoulder past the ready
 * floor (the grey X passes every ink guard), so narrow-layout ready reads
 * additionally need the wash's pale body — and for the same reason the
 * dead read there ignores the shoulder and trusts the body classes alone
 * (see STATUS_READY_MIN_WASH_BODY_PALE / STATUS_DEAD_MAX_SHOULDER_GLOW).
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
 * Slot-comb contrast per layout and side: mean iconness (ink-or-pale
 * column fraction over the strip's body band) at the layout's slot centers
 * minus the mean at its between-slot gap midpoints, maximized over a small
 * global shift. Icon bodies concentrate iconness at true centers while the
 * V-notches between kites drop it, so a rigid comb at the wrong pitch
 * cannot score all four slots at once — positional evidence orthogonal to
 * body decisiveness, strong enough to prove the badge-less narrow-left
 * arrangement (see STATUS_NARROW_LEFT_COMB_* in rois.ts) and to veto the
 * false-friend fresh narrow-left pick off its left half.
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
