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
 * none of the three. The casted spectator HUD draws the same strip at its
 * own geometry — two of them, in fact: the pitches mirror when the specced
 * POV sits on the other team ("cast-mirror", whose right column nearly
 * coincides with POV's). White camera badges under the right team prove
 * either cast arrangement, but broadcasts can hide them while keeping cast
 * geometry, so a badge-less frame picks whichever geometry reads more
 * decisively (bodies far from the dead threshold on either side) instead
 * of assuming POV — with two positional refinements: a decisive slot-comb
 * win proves the badge-less mirror arrangement outright, and a
 * history-less near-tie stays with the cast family (see pickLayout). The
 * cast wash glow is pale, so on cast layouts only the unsaturated glow
 * fraction counts toward ready (and against dead) — saturated backdrop
 * leaking over a dead icon's shoulder cannot fake or suppress a state.
 */
import type { Mat } from "../../cv";
import { copyRoi, type Roi } from "../../image";
import type { DetectedEvent } from "../types";
import {
	STATUS_BODY_BOX_CAST,
	STATUS_BODY_BOX_POV,
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
	STATUS_DPAD_PROBES,
	STATUS_DPAD_PROBES_MIRROR,
	STATUS_FRESH_CAST_MIN_DECISIVENESS,
	STATUS_FRESH_POV_MIN_LEAD,
	STATUS_GLOW_MAX_SPREAD,
	STATUS_GLOW_MIN_VALUE,
	STATUS_INK_MIN_SPREAD,
	STATUS_INK_MIN_VALUE,
	STATUS_LAYOUT_SCORE_CAP,
	STATUS_LAYOUT_STICKY_MARGIN,
	STATUS_MIRROR_COMB_LEAD,
	STATUS_MIRROR_COMB_MIN,
	STATUS_PALE_MAX_SPREAD,
	STATUS_PALE_MIN_VALUE,
	STATUS_READY_CLEAN_WASH_MAX_BODY_INK,
	STATUS_READY_INKY_WASH_MIN_BODY_PALE,
	STATUS_READY_MIN_BODY_PALE,
	STATUS_READY_MIN_SHOULDER_GLOW,
	STATUS_READY_WASH_MAX_BODY_INK,
	STATUS_SHOULDER_BOX_CAST,
	STATUS_SHOULDER_BOX_POV,
	STATUS_SLOT_CENTERS_CAST,
	STATUS_SLOT_CENTERS_CAST_MIRROR,
	STATUS_SLOT_CENTERS_POV,
	STATUS_STICKY_FLIP_COMB_MIN,
	STATUS_WHITE_MAX_SPREAD,
	STATUS_WHITE_MIN_VALUE,
} from "./rois";

export const PLAYER_STATUS_EVENT_TYPE = "PlayerStatus";

export type PlayerStatusFlags = [boolean, boolean, boolean, boolean];

export type PlayerStatusLayout = "pov" | "cast" | "cast-mirror";

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
	 * which icon-strip geometry the frame showed. S3 first-person POV
	 * footage draws the same steady-state geometry as the casted spectator
	 * HUD (measured identical on the 2026-08-11 Um'ami POV VoD), so "cast"
	 * here means the geometry, not the footage type — only `castProven`
	 * reads and the mirror arrangement are evidence of an actual broadcast
	 */
	layout: PlayerStatusLayout;
	/** the white camera badges proved a cast arrangement on this frame */
	castProven: boolean;
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
			castProven: scores === null,
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
		layout === "pov"
			? STATUS_SLOT_CENTERS_POV
			: layout === "cast"
				? STATUS_SLOT_CENTERS_CAST
				: STATUS_SLOT_CENTERS_CAST_MIRROR;
	const shoulderBox =
		layout === "pov" ? STATUS_SHOULDER_BOX_POV : STATUS_SHOULDER_BOX_CAST;
	const bodyBox = layout === "pov" ? STATUS_BODY_BOX_POV : STATUS_BODY_BOX_CAST;

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
	"pov",
	"cast",
	"cast-mirror",
];

/**
 * Which layouts a badge-less frame may flip to from an established one on
 * score alone. The cast-mirror right column nearly coincides with POV's, so
 * decisiveness cannot tell those two apart — and a wrong POV pick on cast
 * footage self-heals (the next badge frame proves the arrangement) while a
 * wrong mirror pick on POV footage never would (POV shows no badges). So
 * the mirror is only reachable via badges or from an established cast
 * layout (the specced POV switching teams mid-game, attested in the AREA
 * CUP VoD's badge-less overhead stretches).
 */
const SCORED_FLIPS: Record<PlayerStatusLayout, readonly PlayerStatusLayout[]> =
	{
		pov: ["cast"],
		cast: ["pov", "cast-mirror"],
		"cast-mirror": ["cast"],
	};

/**
 * Camera badges prove a cast arrangement outright (each arrangement has its
 * own badge columns). Badge-less frames are NOT proven POV — broadcasts can
 * hide the badges while keeping cast icon geometry — so the candidate
 * geometries are scored and the one whose body reads land decisively on
 * either side of the dead threshold wins. A mispicked geometry puts
 * outer-slot boxes between icons or on backdrop, which reads mid-range ink —
 * exactly what the score punishes; boxes on featureless dark backdrop still
 * read "decisively dead" though, so a busy scene can nudge a frame's score
 * across — the sticky margin keeps a single noisy frame from flipping an
 * established layout, and SCORED_FLIPS keeps the POV/mirror false friends
 * from ever trading places without badge proof.
 *
 * Two decisions decisiveness cannot make on its own:
 * - The badge-less MIRROR arrangement (attested in the sendou-triton VoD)
 *   scores below cast even on true mirror frames, so a decisive slot-comb
 *   win (see combContrast) overrides everything but badges — comb evidence
 *   is positional and cannot confuse the POV/mirror false friends because
 *   only their differing left columns can produce a decisive lead.
 * - A history-less pov-vs-cast near-tie (busy backdrops mis-rank cast
 *   footage): the fresh pick stays cast unless cast reads under the floor
 *   or pov leads decisively (STATUS_FRESH_* in rois.ts).
 */
function pickLayout(
	frame: Mat,
	prevLayout: PlayerStatusLayout | undefined,
): {
	layout: PlayerStatusLayout;
	scores: Record<PlayerStatusLayout, number> | null;
} {
	if (badgesVisible(frame, STATUS_DPAD_PROBES))
		return { layout: "cast", scores: null };
	if (badgesVisible(frame, STATUS_DPAD_PROBES_MIRROR))
		return { layout: "cast-mirror", scores: null };
	const scores = Object.fromEntries(
		ALL_LAYOUTS.map((layout) => [layout, layoutDecisiveness(frame, layout)]),
	) as Record<PlayerStatusLayout, number>;
	const combs = combScores(frame);
	if (
		combs["cast-mirror"] >= STATUS_MIRROR_COMB_MIN &&
		combs["cast-mirror"] >= combs.cast + STATUS_MIRROR_COMB_LEAD &&
		combs["cast-mirror"] >= combs.pov + STATUS_MIRROR_COMB_LEAD
	) {
		return { layout: "cast-mirror", scores };
	}
	if (prevLayout) {
		// flips away from cast additionally need positional corroboration:
		// S3 POV footage draws cast geometry, but while the POV player is
		// dead the strip shrinks toward the timer and those transient frames
		// spike the challenger decisiveness past the sticky margin (the
		// 2026-08-11 POV VoD locked into mirror that way) — a real
		// arrangement change moves the slot comb with it, a shrink does not
		const challengers = SCORED_FLIPS[prevLayout].filter(
			(layout) =>
				prevLayout !== "cast" ||
				(combs[layout] >= STATUS_STICKY_FLIP_COMB_MIN &&
					combs[layout] >= combs.cast + STATUS_MIRROR_COMB_LEAD),
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
		scores.cast >= STATUS_FRESH_CAST_MIN_DECISIVENESS &&
		scores.pov < scores.cast + STATUS_FRESH_POV_MIN_LEAD
	) {
		return { layout: "cast", scores };
	}
	return { layout: scores.pov >= scores.cast ? "pov" : "cast", scores };
}

function layoutDecisiveness(frame: Mat, layout: PlayerStatusLayout): number {
	const reads = readSlots(frame, layout).flat();
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
 * zero). On the cast layouts a ready icon is always the wash, which
 * replaces the body's team ink — an ink-heavy body there means the bright
 * read is backdrop leaking past the icon edge, not a held special, unless
 * the body also reads strongly pale (the graded STATUS_READY_*WASH*
 * guards) — and the wash glow is pale, so only the
 * unsaturated glow fraction counts (a saturated bright leak, like sky over
 * a dead icon's shoulder, is not a wash — see STATUS_GLOW_MAX_SPREAD).
 */
function classifySlot(
	bodyInk: number,
	bodyPale: number,
	shoulderGlow: number,
	shoulderPaleGlow: number,
	layout: PlayerStatusLayout,
): SlotRead {
	const washGlow = layout === "pov" ? shoulderGlow : shoulderPaleGlow;
	const dead =
		bodyInk <= STATUS_DEAD_MAX_BODY_INK &&
		washGlow <= STATUS_DEAD_MAX_SHOULDER_GLOW &&
		bodyPale <= STATUS_DEAD_MAX_BODY_PALE;
	const washedBody =
		bodyInk <= STATUS_READY_CLEAN_WASH_MAX_BODY_INK ||
		(bodyInk <= STATUS_READY_WASH_MAX_BODY_INK &&
			bodyPale >= STATUS_READY_INKY_WASH_MIN_BODY_PALE);
	const special =
		!dead &&
		(washGlow >= STATUS_READY_MIN_SHOULDER_GLOW ||
			bodyPale >= STATUS_READY_MIN_BODY_PALE) &&
		(layout === "pov" || washedBody);
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
 * Slot-comb contrast per layout: mean iconness (ink-or-pale column
 * fraction over the strip's body band) at the layout's slot centers minus
 * the mean at its between-slot gap midpoints, maximized over a small
 * global shift. Icon bodies concentrate iconness at true centers while the
 * V-notches between kites drop it, so a rigid comb at the wrong pitch
 * cannot score all four slots at once — positional evidence orthogonal to
 * body decisiveness, strong enough to prove the badge-less mirror
 * arrangement (see STATUS_MIRROR_COMB_* in rois.ts).
 */
function combScores(frame: Mat): Record<PlayerStatusLayout, number> {
	const profiles = STATUS_COMB_SIDE_SPANS.map(([x0, x1]) =>
		iconnessProfile(frame, x0, x1),
	);
	const centersOf = (layout: PlayerStatusLayout) =>
		layout === "pov"
			? STATUS_SLOT_CENTERS_POV
			: layout === "cast"
				? STATUS_SLOT_CENTERS_CAST
				: STATUS_SLOT_CENTERS_CAST_MIRROR;
	return Object.fromEntries(
		ALL_LAYOUTS.map((layout) => [
			layout,
			centersOf(layout).reduce(
				(sum, sideCenters, side) =>
					sum +
					combContrast(
						profiles[side]!,
						STATUS_COMB_SIDE_SPANS[side]![0],
						sideCenters,
					),
				0,
			),
		]),
	) as Record<PlayerStatusLayout, number>;
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
