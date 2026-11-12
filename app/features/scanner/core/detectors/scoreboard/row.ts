/**
 * Shared scoreboard row parse (weapon with special-icon tie-break, paint, name
 * trimmed at the leftmost paint digit, stats); callers differ only in ROI
 * geometry, glyph sets and two match options.
 */
import { toMainWeaponId } from "../../../scanner-types";
import type { Mat } from "../../cv";
import * as Decisions from "../../decisions";
import * as FieldScores from "../../field-scores";
import type { GlyphSet } from "../../glyphs";
import { cropRoi, type Roi } from "../../image";
import { all, type MatchSteps } from "../../match-steps";
import { type ParsedNumber, parseNumberSteps } from "./digits";
import type { ScoreboardPlayer, ScoreboardRowDebug } from "./index";
import { type ParsedName, parseNameSteps } from "./names";
import { povYellowFraction } from "./pov";
import {
	disambiguateWeaponBySpecial,
	matchSpecialSteps,
	type SpecialMatch,
	type SpecialTemplate,
	tiedWeaponsWithDistinctSpecials,
} from "./specials";
import {
	matchWeaponSteps,
	type WeaponMatch,
	type WeaponTemplate,
} from "./weapons";

/**
 * Below this the best icon is no read: every fixture's true icon scores >= 0.53, while a
 * kit without a template (new after a game patch) reads as its nearest sibling at up to 0.92,
 * so the floor only drops the clearest non-matches.
 */
const WEAPON_MIN_SCORE = 0.5;

/**
 * The scores a clean frame reads a row's text at, just under the lowest of
 * the fixtures' rows (names 0.618+, paint totals 0.640+ on a low-res replay
 * and 0.80+ otherwise, stat counters 0.776+). A field under its floor is one
 * a later frame may still read better, so the board is not complete. A name
 * score does not tell a glyph twin apart (a misread "p" for "P" scores 0.92).
 */
const COMPLETE_NAME_MIN_SCORE = 0.6;
const COMPLETE_PAINT_MIN_SCORE = 0.6;
const COMPLETE_STAT_MIN_SCORE = 0.75;

/** Per-row ROI geometry; the replay detector closes these over its panel dx. */
export interface RowRois {
	weapon(cy: number): Roi;
	specialIcon(cy: number): Roi;
	paint(cy: number): Roi;
	name(cy: number): Roi;
	stat(cy: number, i: 0 | 1 | 2): Roi;
	povArrow(cy: number): Roi;
}

export interface RowResources {
	weapons: WeaponTemplate[];
	specials?: SpecialTemplate[] | null;
	paintDigits: GlyphSet | null;
	statDigits: GlyphSet | null;
	nameGlyphs: GlyphSet | null;
}

export interface RowOptions {
	/** passed through to matchWeapon (replay rows sit on a lighter panel) */
	weaponInkThreshold?: number;
	/** replay only: the left-aligned paint puts the "p" suffix inside the ROI under 4 digits */
	paintDropLoweredTrailing?: boolean;
	/** binarization threshold for the stat digits, for layouts whose digits render softer */
	statBinThreshold?: number;
}

/**
 * Parses one player row; `scores` are keyed by the row's own fields. Weapon,
 * paint→name and the stats read in one lockstep.
 */
export function* parseScoreboardRowSteps(
	gray: Mat,
	rgb: Mat,
	cy: number,
	rois: RowRois,
	resources: RowResources,
	options: RowOptions = {},
	speculative = false,
): MatchSteps<{
	player: ScoreboardPlayer;
	debug: ScoreboardRowDebug;
	scores: FieldScores.FieldScores;
}> {
	const [weaponRead, { paint, name }, stats] = yield* all([
		readWeapon(rgb, cy, rois, resources, options),
		readPaintAndName(gray, cy, rois, resources, options, speculative),
		readStats(gray, cy, rois, resources, options, speculative),
	]);
	const { weapon, special } = weaponRead ?? { weapon: null };

	const statValues: (number | null)[] = [null, null, null];
	const statScores: [number, number, number] = [0, 0, 0];
	for (const [i, parsed] of (stats ?? []).entries()) {
		statValues[i] = parsed.value;
		statScores[i] = parsed.confidence;
	}

	return {
		player: {
			name: name?.name ?? "",
			weaponId:
				weapon &&
				Decisions.atLeast(
					"scoreboard/row:WEAPON_MIN_SCORE",
					weapon.score,
					WEAPON_MIN_SCORE,
				)
					? toMainWeaponId(weapon.id)
					: null,
			paint: paint?.value ?? null,
			ka: statValues[0] ?? null,
			d: statValues[1] ?? null,
			s: statValues[2] ?? null,
		},
		debug: {
			weapon,
			special,
			paintScore: paint?.confidence ?? 0,
			nameScore: name?.confidence ?? 0,
			statScores,
			povFraction: povYellowFraction(rgb, rois.povArrow(cy)),
		},
		scores: FieldScores.of({
			weaponId: weapon?.score,
			paint: paint?.confidence,
			name: name?.confidence,
			ka: stats?.[0]?.confidence,
			d: stats?.[1]?.confidence,
			s: stats?.[2]?.confidence,
		}),
	};
}

/**
 * Whether a board's rows are read whole: every weapon, name, paint total and
 * stat counter there, the text at the scores a clean frame reads it at.
 */
export function rowsComplete(
	players: readonly ScoreboardPlayer[],
	scores: FieldScores.FieldScores,
): boolean {
	if (players.length === 0) return false;
	return players.every((player, i) => {
		const row = `players.${i}`;
		return (
			player.weaponId !== null &&
			player.name !== "" &&
			player.paint !== null &&
			player.ka !== null &&
			player.d !== null &&
			player.s !== null &&
			FieldScores.reach(scores, [`${row}.name`], COMPLETE_NAME_MIN_SCORE) &&
			FieldScores.reach(scores, [`${row}.paint`], COMPLETE_PAINT_MIN_SCORE) &&
			FieldScores.reach(
				scores,
				[`${row}.ka`, `${row}.d`, `${row}.s`],
				COMPLETE_STAT_MIN_SCORE,
			)
		);
	});
}

/** Rows' scores under their players' paths in a board's `data`, in `players` order. */
export function playerScores(
	rows: readonly { scores: FieldScores.FieldScores }[],
): FieldScores.FieldScores {
	return Object.assign(
		{},
		...rows.map((row, i) => FieldScores.under(`players.${i}`, row.scores)),
	);
}

function* readWeapon(
	rgb: Mat,
	cy: number,
	rois: RowRois,
	resources: RowResources,
	options: RowOptions,
): MatchSteps<{ weapon: WeaponMatch; special?: SpecialMatch } | null> {
	if (resources.weapons.length === 0) return null;
	const crop = cropRoi(rgb, rois.weapon(cy));
	let weapon = yield* matchWeaponSteps(
		crop,
		resources.weapons,
		options.weaponInkThreshold !== undefined
			? { inkThreshold: options.weaponInkThreshold }
			: {},
	);
	crop.delete();
	// near-tied icons with different kit specials: the row's special icon breaks the tie
	let special: SpecialMatch | undefined;
	if (resources.specials?.length && tiedWeaponsWithDistinctSpecials(weapon)) {
		const spCrop = cropRoi(rgb, rois.specialIcon(cy));
		special = yield* matchSpecialSteps(spCrop, resources.specials);
		spCrop.delete();
		weapon = disambiguateWeaponBySpecial(weapon, special);
	}
	return { weapon, special };
}

/** Paint first, so the name region can be trimmed at the leftmost paint digit. */
function* readPaintAndName(
	gray: Mat,
	cy: number,
	rois: RowRois,
	resources: RowResources,
	options: RowOptions,
	speculative: boolean,
): MatchSteps<{ paint: ParsedNumber | null; name: ParsedName | null }> {
	let paint: ParsedNumber | null = null;
	const pRoi = rois.paint(cy);
	if (resources.paintDigits) {
		const crop = cropRoi(gray, pRoi);
		paint = yield* parseNumberSteps(
			crop,
			resources.paintDigits,
			{ dropLoweredTrailing: options.paintDropLoweredTrailing },
			speculative,
		);
		crop.delete();
	}

	let name: ParsedName | null = null;
	if (resources.nameGlyphs) {
		const base = rois.name(cy);
		const paintLeftAbs =
			paint && paint.leftX !== null ? pRoi.x + paint.leftX : pRoi.x + pRoi.w;
		const w = Math.min(base.w, Math.max(0, paintLeftAbs - 6 - base.x));
		if (w > 8) {
			const crop = cropRoi(gray, { ...base, w });
			name = yield* parseNameSteps(crop, resources.nameGlyphs, {}, speculative);
			crop.delete();
		}
	}
	return { paint, name };
}

function* readStats(
	gray: Mat,
	cy: number,
	rois: RowRois,
	resources: RowResources,
	options: RowOptions,
	speculative: boolean,
): MatchSteps<ParsedNumber[] | null> {
	const { statDigits } = resources;
	if (!statDigits) return null;
	const crops = ([0, 1, 2] as const).map((i) =>
		cropRoi(gray, rois.stat(cy, i)),
	);
	const parsed = yield* all(
		crops.map((crop) =>
			parseNumberSteps(
				crop,
				statDigits,
				{ binThreshold: options.statBinThreshold },
				speculative,
			),
		),
	);
	for (const crop of crops) crop.delete();
	return parsed;
}
