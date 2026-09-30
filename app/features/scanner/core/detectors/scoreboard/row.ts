/**
 * Shared scoreboard row parse (weapon with special-icon tie-break, paint, name
 * trimmed at the leftmost paint digit, stats); callers differ only in ROI
 * geometry, glyph sets and two match options.
 */
import { toMainWeaponId } from "../../../scanner-types";
import type { Mat } from "../../cv";
import type { GlyphSet } from "../../glyphs";
import { cropRoi, type Roi } from "../../image";
import { type ParsedNumber, parseNumber } from "./digits";
import type { ScoreboardPlayer, ScoreboardRowDebug } from "./index";
import { parseName } from "./names";
import { povYellowFraction } from "./pov";
import {
	disambiguateWeaponBySpecial,
	matchSpecial,
	type SpecialMatch,
	type SpecialTemplate,
	tiedWeaponsWithDistinctSpecials,
} from "./specials";
import { matchWeapon, type WeaponMatch, type WeaponTemplate } from "./weapons";

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
}

/** Parses one player row; per-field confidences append to `confidences`. */
export function parseScoreboardRow(
	gray: Mat,
	rgb: Mat,
	cy: number,
	rois: RowRois,
	resources: RowResources,
	confidences: number[],
	options: RowOptions = {},
): { player: ScoreboardPlayer; debug: ScoreboardRowDebug } {
	let weapon: WeaponMatch | null = null;
	let special: SpecialMatch | undefined;
	if (resources.weapons.length > 0) {
		const crop = cropRoi(rgb, rois.weapon(cy));
		weapon = matchWeapon(
			crop,
			resources.weapons,
			options.weaponInkThreshold !== undefined
				? { inkThreshold: options.weaponInkThreshold }
				: {},
		);
		crop.delete();
		// near-tied icons with different kit specials: the row's special icon breaks the tie
		if (resources.specials?.length && tiedWeaponsWithDistinctSpecials(weapon)) {
			const spCrop = cropRoi(rgb, rois.specialIcon(cy));
			special = matchSpecial(spCrop, resources.specials);
			spCrop.delete();
			weapon = disambiguateWeaponBySpecial(weapon, special);
		}
		confidences.push(Math.max(0, weapon.score));
	}

	// paint (parse first so the name region can be trimmed at the digits)
	let paint: ParsedNumber | null = null;
	const pRoi = rois.paint(cy);
	if (resources.paintDigits) {
		const crop = cropRoi(gray, pRoi);
		paint = parseNumber(crop, resources.paintDigits, {
			dropLoweredTrailing: options.paintDropLoweredTrailing,
		});
		crop.delete();
		confidences.push(paint.confidence);
	}

	// name, trimmed at the leftmost paint digit
	let name: ReturnType<typeof parseName> | null = null;
	if (resources.nameGlyphs) {
		const base = rois.name(cy);
		const paintLeftAbs =
			paint && paint.leftX !== null ? pRoi.x + paint.leftX : pRoi.x + pRoi.w;
		const w = Math.min(base.w, Math.max(0, paintLeftAbs - 6 - base.x));
		if (w > 8) {
			const crop = cropRoi(gray, { ...base, w });
			name = parseName(crop, resources.nameGlyphs);
			crop.delete();
			confidences.push(name.confidence);
		}
	}

	// stat counters
	const statValues: (number | null)[] = [null, null, null];
	const statScores: [number, number, number] = [0, 0, 0];
	if (resources.statDigits) {
		for (const i of [0, 1, 2] as const) {
			const crop = cropRoi(gray, rois.stat(cy, i));
			const parsed = parseNumber(crop, resources.statDigits);
			crop.delete();
			statValues[i] = parsed.value;
			statScores[i] = parsed.confidence;
			confidences.push(parsed.confidence);
		}
	}

	return {
		player: {
			name: name?.name ?? "",
			weaponId: weapon ? toMainWeaponId(weapon.id) : null,
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
	};
}
