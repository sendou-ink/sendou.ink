/**
 * PlayerStatus: the per-player state read off the eight squid/octo icons
 * flanking the match timer, emitted by the ObjectiveDetector alongside each
 * Objective read (same frame, same `time`, so callers can pair the two).
 *
 * Per slot, two pixel-class fractions decide the state (rois.ts documents
 * the calibration): an alive icon's body is saturated team ink; holding
 * special washes the upper body into a bright pale glow (the shoulder
 * probe); a splatted icon is an unsaturated grey/dark X with neither. The
 * casted spectator HUD draws the same strip at its own geometry — the
 * white D-pad camera badges under the right team pick the layout.
 */
import type { Mat } from "../../cv";
import { copyRoi, type Roi } from "../../image";
import type { DetectedEvent } from "../types";
import {
	STATUS_BODY_BOX_CAST,
	STATUS_BODY_BOX_POV,
	STATUS_CAST_MIN_DPAD_WHITE,
	STATUS_DEAD_MAX_BODY_INK,
	STATUS_DEAD_MAX_SHOULDER_GLOW,
	STATUS_DPAD_PROBES,
	STATUS_GLOW_MIN_VALUE,
	STATUS_INK_MIN_SPREAD,
	STATUS_INK_MIN_VALUE,
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
	shoulderGlow: number;
}

/**
 * Parse the icon strip of a frame the objective gate already anchored as
 * the in-match counter HUD. Callers emit the event only alongside a
 * successful Objective read — the counter parse carries the lookalike
 * rejection for both.
 */
export function parsePlayerStatus(
	frame: Mat,
	t: number,
	time: number | null,
): DetectedEvent<PlayerStatusData> {
	const layout: PlayerStatusLayout = isCastLayout(frame) ? "cast" : "pov";
	const centers =
		layout === "cast" ? STATUS_SLOT_CENTERS_CAST : STATUS_SLOT_CENTERS_POV;
	const shoulderBox =
		layout === "cast" ? STATUS_SHOULDER_BOX_CAST : STATUS_SHOULDER_BOX_POV;
	const bodyBox =
		layout === "cast" ? STATUS_BODY_BOX_CAST : STATUS_BODY_BOX_POV;

	const sides = centers.map((sideCenters) =>
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
			return classifySlot(body.ink, shoulder.glow);
		}),
	) as [SlotRead[], SlotRead[]];

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
			bodyInk: reads.map((read) => Number(read.bodyInk.toFixed(2))),
			shoulderGlow: reads.map((read) => Number(read.shoulderGlow.toFixed(2))),
		},
	};
}

/**
 * State from the two fractions, with a confidence scaled by the distance
 * to the nearest decision boundary (1 at twice the threshold / at zero).
 */
function classifySlot(bodyInk: number, shoulderGlow: number): SlotRead {
	const dead =
		bodyInk <= STATUS_DEAD_MAX_BODY_INK &&
		shoulderGlow <= STATUS_DEAD_MAX_SHOULDER_GLOW;
	const special = !dead && shoulderGlow >= STATUS_READY_MIN_SHOULDER_GLOW;
	const confidence = dead
		? Math.min(
				1,
				(STATUS_DEAD_MAX_BODY_INK - bodyInk) / STATUS_DEAD_MAX_BODY_INK,
			)
		: special
			? Math.min(1, shoulderGlow / (STATUS_READY_MIN_SHOULDER_GLOW * 2))
			: Math.min(1, bodyInk / (STATUS_DEAD_MAX_BODY_INK * 2));
	return { dead, special, confidence, bodyInk, shoulderGlow };
}

/** Ink and glow pixel fractions of a ROI (see rois.ts for the classes). */
function classFractions(frame: Mat, roi: Roi): { ink: number; glow: number } {
	const crop = copyRoi(frame, roi);
	const { data } = crop;
	const channels = crop.channels();
	let ink = 0;
	let glow = 0;
	let count = 0;
	for (let i = 0; i < data.length; i += channels) {
		const r = data[i]!;
		const g = data[i + 1]!;
		const b = data[i + 2]!;
		const value = Math.max(r, g, b);
		const spread = value - Math.min(r, g, b);
		if (spread >= STATUS_INK_MIN_SPREAD && value >= STATUS_INK_MIN_VALUE) ink++;
		if (value >= STATUS_GLOW_MIN_VALUE) glow++;
		count++;
	}
	crop.delete();
	return { ink: ink / count, glow: glow / count };
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
