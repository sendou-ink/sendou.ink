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
 * of assuming POV.
 */
import type { Mat } from "../../cv";
import { copyRoi, type Roi } from "../../image";
import type { DetectedEvent } from "../types";
import {
	STATUS_BODY_BOX_CAST,
	STATUS_BODY_BOX_POV,
	STATUS_CAST_MIN_DPAD_WHITE,
	STATUS_DEAD_MAX_BODY_INK,
	STATUS_DEAD_MAX_BODY_PALE,
	STATUS_DEAD_MAX_SHOULDER_GLOW,
	STATUS_DPAD_PROBES,
	STATUS_DPAD_PROBES_MIRROR,
	STATUS_GLOW_MIN_VALUE,
	STATUS_INK_MIN_SPREAD,
	STATUS_INK_MIN_VALUE,
	STATUS_LAYOUT_SCORE_CAP,
	STATUS_LAYOUT_STICKY_MARGIN,
	STATUS_PALE_MAX_SPREAD,
	STATUS_PALE_MIN_VALUE,
	STATUS_READY_MIN_BODY_PALE,
	STATUS_READY_MIN_SHOULDER_GLOW,
	STATUS_READY_WASH_MAX_BODY_INK,
	STATUS_SHOULDER_BOX_CAST,
	STATUS_SHOULDER_BOX_POV,
	STATUS_SLOT_CENTERS_CAST,
	STATUS_SLOT_CENTERS_CAST_MIRROR,
	STATUS_SLOT_CENTERS_POV,
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
	/** which icon-strip geometry the frame showed */
	layout: PlayerStatusLayout;
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
			return classifySlot(body.ink, body.pale, shoulder.glow, layout);
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
	if (prevLayout) {
		const challenger = SCORED_FLIPS[prevLayout].reduce((a, b) =>
			scores[b] > scores[a] ? b : a,
		);
		return {
			layout:
				scores[challenger] > scores[prevLayout] + STATUS_LAYOUT_STICKY_MARGIN
					? challenger
					: prevLayout,
			scores,
		};
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
 * State from the three fractions, with a confidence scaled by the distance
 * to the nearest decision boundary (1 at twice the threshold / at zero).
 * On the cast layout a ready icon is always the wash, which replaces the
 * body's team ink — an ink-heavy body there means the bright read is
 * backdrop leaking past the icon edge, not a held special (see
 * STATUS_READY_WASH_MAX_BODY_INK).
 */
function classifySlot(
	bodyInk: number,
	bodyPale: number,
	shoulderGlow: number,
	layout: PlayerStatusLayout,
): SlotRead {
	const dead =
		bodyInk <= STATUS_DEAD_MAX_BODY_INK &&
		shoulderGlow <= STATUS_DEAD_MAX_SHOULDER_GLOW &&
		bodyPale <= STATUS_DEAD_MAX_BODY_PALE;
	const special =
		!dead &&
		(shoulderGlow >= STATUS_READY_MIN_SHOULDER_GLOW ||
			bodyPale >= STATUS_READY_MIN_BODY_PALE) &&
		(layout === "pov" || bodyInk <= STATUS_READY_WASH_MAX_BODY_INK);
	const confidence = dead
		? Math.min(
				1,
				(STATUS_DEAD_MAX_BODY_INK - bodyInk) / STATUS_DEAD_MAX_BODY_INK,
			)
		: special
			? Math.min(
					1,
					Math.max(
						shoulderGlow / (STATUS_READY_MIN_SHOULDER_GLOW * 2),
						bodyPale / (STATUS_READY_MIN_BODY_PALE * 2),
					),
				)
			: Math.min(1, bodyInk / (STATUS_DEAD_MAX_BODY_INK * 2));
	return { dead, special, confidence, bodyInk, bodyPale, shoulderGlow };
}

/** Ink, glow, and pale pixel fractions of a ROI (see rois.ts for the classes). */
function classFractions(
	frame: Mat,
	roi: Roi,
): { ink: number; glow: number; pale: number } {
	const crop = copyRoi(frame, roi);
	const { data } = crop;
	const channels = crop.channels();
	let ink = 0;
	let glow = 0;
	let pale = 0;
	let count = 0;
	for (let i = 0; i < data.length; i += channels) {
		const r = data[i]!;
		const g = data[i + 1]!;
		const b = data[i + 2]!;
		const value = Math.max(r, g, b);
		const spread = value - Math.min(r, g, b);
		if (spread >= STATUS_INK_MIN_SPREAD && value >= STATUS_INK_MIN_VALUE) ink++;
		if (value >= STATUS_GLOW_MIN_VALUE) glow++;
		if (value >= STATUS_PALE_MIN_VALUE && spread <= STATUS_PALE_MAX_SPREAD)
			pale++;
		count++;
	}
	crop.delete();
	return { ink: ink / count, glow: glow / count, pale: pale / count };
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
