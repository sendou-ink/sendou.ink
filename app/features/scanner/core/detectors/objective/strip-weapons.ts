/**
 * StripWeapons: per-slot weapon-icon evidence off the same icon strip the
 * PlayerStatus read classifies, emitted by the ObjectiveDetector on a
 * sampled cadence (identities are fixed for a match, so every read would be
 * waste). The results scoreboard re-sorts each team per game while the
 * strip keeps the lobby seating (attested in the sendou-triton VoD: strip
 * [Planetz, .52, Neo Splash, Snipewriter] vs scoreboard rows
 * [.52, Neo Splash, Snipewriter, Planetz]), so status samples cannot be
 * paired with scoreboard rows by position alone — the match builder
 * aggregates these candidate lists across the match and solves the
 * slot→row assignment against the scoreboard's weapons
 * (slot-row-assignment.ts).
 *
 * A slot's icon is the weapon render over a team-ink squid plate; the
 * plate (and scene bleeding through it — the plates are translucent) is
 * what drowns template matching, so saturated pixels near the plate's
 * modal hue are flattened to the template background before the NCC
 * ranking. One read's top-1 is only right about half the time on attested
 * footage — the value is in the aggregate, so the event carries a ranked
 * candidate list per slot. Splatted slots grey the render out and are
 * skipped rather than guessed.
 */
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { getCV, type Mat } from "../../cv";
import { copyRoi } from "../../image";
import { hueDistance, hueOf } from "../../ink-color";
import { matchWeapon, type WeaponTemplate } from "../scoreboard/weapons";
import type { DetectedEvent } from "../types";
import type { PlayerStatusData, PlayerStatusLayout } from "./player-status";
import {
	STATUS_SLOT_CENTERS_EVEN,
	STATUS_SLOT_CENTERS_NARROW_LEFT,
	STATUS_SLOT_CENTERS_NARROW_RIGHT,
	STRIP_WEAPON_BOX,
	STRIP_WEAPON_INK_THRESHOLD,
	STRIP_WEAPON_KNOCKOUT_MIN_SPREAD,
	STRIP_WEAPON_KNOCKOUT_MIN_VALUE,
	STRIP_WEAPON_MAX_PLATE_HUE_DIST,
	STRIP_WEAPON_TEMPLATE_BACKGROUND,
	STRIP_WEAPON_TOP_K,
} from "./rois";

export const STRIP_WEAPONS_EVENT_TYPE = "StripWeapons";

export interface StripWeaponCandidate {
	weaponId: MainWeaponId;
	score: number;
}

export interface StripWeaponsData {
	/** match timer at the read, pairing it with the Objective/PlayerStatus events */
	time: number | null;
	/** the icon-strip geometry the paired PlayerStatus read picked */
	layout: PlayerStatusLayout;
	/**
	 * ranked weapon candidates per slot, [left team, right team], slots
	 * left-to-right as drawn; null = slot skipped (splatted icons grey the
	 * weapon render out)
	 */
	slots: [(StripWeaponCandidate[] | null)[], (StripWeaponCandidate[] | null)[]];
}

/**
 * Match every alive slot's icon against the strip weapon templates.
 * `status` is the PlayerStatus read off the same frame — its layout picks
 * the slot centers and its dead flags pick which slots are worth reading.
 */
export function parseStripWeapons(
	frame: Mat,
	t: number,
	status: PlayerStatusData,
	templates: WeaponTemplate[],
): DetectedEvent<StripWeaponsData> {
	const centers = slotCenters(status.layout);
	const scores: number[] = [];
	const slots = centers.map((sideCenters, side) =>
		sideCenters.map((cx, slot): StripWeaponCandidate[] | null => {
			if (status.dead[side as 0 | 1][slot]) return null;
			const candidates = matchSlot(frame, cx, templates);
			if (candidates.length > 0) scores.push(candidates[0]!.score);
			return candidates;
		}),
	) as StripWeaponsData["slots"];

	return {
		type: STRIP_WEAPONS_EVENT_TYPE,
		t,
		// raw NCC peaks on attested footage sit ~0.4-0.6 even for correct
		// reads; the aggregate assignment carries the reliability, so the
		// event's own confidence only reflects that something matched at all
		confidence: scores.length > 0 ? Math.max(...scores) : 0,
		data: {
			time: status.time,
			layout: status.layout,
			slots,
		},
	};
}

function slotCenters(
	layout: PlayerStatusLayout,
): readonly [readonly number[], readonly number[]] {
	return layout === "even"
		? STATUS_SLOT_CENTERS_EVEN
		: layout === "narrow-right"
			? STATUS_SLOT_CENTERS_NARROW_RIGHT
			: STATUS_SLOT_CENTERS_NARROW_LEFT;
}

function matchSlot(
	frame: Mat,
	cx: number,
	templates: WeaponTemplate[],
): StripWeaponCandidate[] {
	const cv = getCV();
	const crop = copyRoi(frame, {
		x: cx + STRIP_WEAPON_BOX.dx,
		y: STRIP_WEAPON_BOX.y,
		w: STRIP_WEAPON_BOX.w,
		h: STRIP_WEAPON_BOX.h,
	});
	const search = new cv.Mat();
	cv.cvtColor(crop, search, cv.COLOR_RGBA2RGB);
	crop.delete();
	knockoutPlate(search);
	const match = matchWeapon(search, templates, {
		inkThreshold: STRIP_WEAPON_INK_THRESHOLD,
		topN: STRIP_WEAPON_TOP_K,
	});
	search.delete();
	return match.top.map((candidate) => ({
		weaponId: Number(candidate.id) as MainWeaponId,
		score: candidate.score,
	}));
}

/**
 * Flatten the squid plate out of the search region: the modal hue of the
 * region's saturated pixels is the plate's team ink, and every pixel near
 * that hue is replaced with the flat template background, leaving the
 * weapon render (grey/white bodies and off-hue accents) to carry the NCC.
 */
function knockoutPlate(search: Mat): void {
	const { data } = search;
	const n = search.rows * search.cols;
	const bins = new Array<number>(36).fill(0);
	for (let i = 0; i < n; i++) {
		const r = data[i * 3]!;
		const g = data[i * 3 + 1]!;
		const b = data[i * 3 + 2]!;
		const value = Math.max(r, g, b);
		const spread = value - Math.min(r, g, b);
		if (
			spread >= STRIP_WEAPON_KNOCKOUT_MIN_SPREAD + 15 &&
			value >= STRIP_WEAPON_KNOCKOUT_MIN_VALUE + 15
		) {
			bins[Math.floor(hueOf({ r, g, b }) / 10)]!++;
		}
	}
	const plateHue = bins.indexOf(Math.max(...bins)) * 10 + 5;
	for (let i = 0; i < n; i++) {
		const r = data[i * 3]!;
		const g = data[i * 3 + 1]!;
		const b = data[i * 3 + 2]!;
		const value = Math.max(r, g, b);
		const spread = value - Math.min(r, g, b);
		if (
			spread >= STRIP_WEAPON_KNOCKOUT_MIN_SPREAD &&
			value >= STRIP_WEAPON_KNOCKOUT_MIN_VALUE &&
			hueDistance(hueOf({ r, g, b }), plateHue) <=
				STRIP_WEAPON_MAX_PLATE_HUE_DIST
		) {
			data[i * 3] = STRIP_WEAPON_TEMPLATE_BACKGROUND;
			data[i * 3 + 1] = STRIP_WEAPON_TEMPLATE_BACKGROUND;
			data[i * 3 + 2] = STRIP_WEAPON_TEMPLATE_BACKGROUND;
		}
	}
}
