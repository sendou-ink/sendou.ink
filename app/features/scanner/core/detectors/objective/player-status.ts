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
 * own geometry. White D-pad camera badges under the right team prove the
 * cast layout, but broadcasts can hide them while keeping cast geometry,
 * so a badge-less frame picks whichever geometry reads more decisively
 * (bodies far from the dead threshold on either side) instead of assuming
 * POV.
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
	STATUS_GLOW_MIN_VALUE,
	STATUS_INK_MIN_SPREAD,
	STATUS_INK_MIN_VALUE,
	STATUS_LAYOUT_SCORE_CAP,
	STATUS_LAYOUT_STICKY_MARGIN,
	STATUS_PALE_MAX_SPREAD,
	STATUS_PALE_MIN_VALUE,
	STATUS_READY_MIN_BODY_PALE,
	STATUS_READY_MIN_SHOULDER_GLOW,
	STATUS_SHOULDER_BOX_CAST,
	STATUS_SHOULDER_BOX_POV,
	STATUS_SLOT_CENTERS_CAST,
	STATUS_SLOT_CENTERS_POV,
	STATUS_WHITE_MAX_SPREAD,
	STATUS_WHITE_MIN_VALUE,
} from "./rois";

export const PLAYER_STATUS_EVENT_TYPE = "PlayerStatus";

export type PlayerStatusFlags = [boolean, boolean, boolean, boolean];

export type PlayerStatusLayout = "pov" | "cast";

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
				? {
						pov: Number(scores.pov.toFixed(3)),
						cast: Number(scores.cast.toFixed(3)),
					}
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
		layout === "cast" ? STATUS_SLOT_CENTERS_CAST : STATUS_SLOT_CENTERS_POV;
	const shoulderBox =
		layout === "cast" ? STATUS_SHOULDER_BOX_CAST : STATUS_SHOULDER_BOX_POV;
	const bodyBox =
		layout === "cast" ? STATUS_BODY_BOX_CAST : STATUS_BODY_BOX_POV;

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
			return classifySlot(body.ink, body.pale, shoulder.glow);
		}),
	) as [SlotRead[], SlotRead[]];
}

/**
 * Camera badges prove the cast layout outright. Badge-less frames are NOT
 * proven POV — broadcasts can hide the badges while keeping the cast icon
 * geometry — so both geometries are tried and the one whose body reads
 * land decisively on either side of the dead threshold wins. A mispicked
 * geometry puts outer-slot boxes between icons or on backdrop, which reads
 * mid-range ink — exactly what the score punishes; boxes on featureless
 * dark backdrop still read "decisively dead" though, so a busy scene can
 * nudge a frame's score across — the sticky margin keeps a single noisy
 * frame from flipping an established layout.
 */
function pickLayout(
	frame: Mat,
	prevLayout: PlayerStatusLayout | undefined,
): {
	layout: PlayerStatusLayout;
	scores: { pov: number; cast: number } | null;
} {
	if (isCastLayout(frame)) return { layout: "cast", scores: null };
	const scores = {
		pov: layoutDecisiveness(frame, "pov"),
		cast: layoutDecisiveness(frame, "cast"),
	};
	if (prevLayout) {
		const other: PlayerStatusLayout = prevLayout === "pov" ? "cast" : "pov";
		return {
			layout:
				scores[other] > scores[prevLayout] + STATUS_LAYOUT_STICKY_MARGIN
					? other
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
 */
function classifySlot(
	bodyInk: number,
	bodyPale: number,
	shoulderGlow: number,
): SlotRead {
	const dead =
		bodyInk <= STATUS_DEAD_MAX_BODY_INK &&
		shoulderGlow <= STATUS_DEAD_MAX_SHOULDER_GLOW &&
		bodyPale <= STATUS_DEAD_MAX_BODY_PALE;
	const special =
		!dead &&
		(shoulderGlow >= STATUS_READY_MIN_SHOULDER_GLOW ||
			bodyPale >= STATUS_READY_MIN_BODY_PALE);
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

/** All four D-pad probes reading white = the casted spectator layout. */
function isCastLayout(frame: Mat): boolean {
	return STATUS_DPAD_PROBES.every((roi) => {
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
