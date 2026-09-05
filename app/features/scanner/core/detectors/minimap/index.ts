/**
 * MinimapDetector: parses the in-match map overlay (X) — own-team callout cards
 * (name, main weapon, three main-ability badges), enemy panel rows (weapon,
 * abilities; no enemy names) and the stage matched from the drawn map
 * (stage.ts). Map control is deliberately not reported. Two per-player states
 * (`dead`, `specialReady`) feed the match builder's timeline and steer the reads:
 * - a respawning player's card is struck through with a team-color X covering
 *   name and badges (enemy rows keep their weapon icon); an occlusion probe
 *   skips covered fields and reports them null;
 * - a charged special swaps the background for light camo; weapons match
 *   against template sets composited for the surface behind them (bg-40 dark,
 *   bg-150 camo — dark templates anti-correlate there), so a corner-brightness
 *   probe picks template set, ink threshold and score floor per card.
 */

import type {
	AbilityWithUnknown,
	MainWeaponId,
	StageId,
} from "~/modules/in-game-lists/types";
import { toAbilityWithUnknown, toMainWeaponId } from "../../../scanner-types";
import { getCV, type Mat } from "../../cv";
import { type GlyphSet, scaleGlyphSet } from "../../glyphs";
import {
	copyRoi,
	cropRoi,
	laplacianAbs,
	maxBrightness,
	meanBrightness,
	type Roi,
} from "../../image";
import { type InkRgb, meanInkColor } from "../../ink-color";
import type { ScoreboardResources } from "../scoreboard/index";
import { type ParsedName, parseName } from "../scoreboard/names";
import {
	disambiguateWeaponBySub,
	matchSpecial,
	tiedWeaponsWithDistinctSubs,
} from "../scoreboard/specials";
import { matchWeapon, type WeaponMatch } from "../scoreboard/weapons";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	badgeRoi,
	CARD_LAYOUTS,
	type CardSlot,
	CROSS_MIN_FRACTION,
	CROSS_MIN_LAPLACIAN,
	CROSS_SATURATION_MIN,
	CROSS_VALUE_MIN,
	ENEMY_BADGE_XS,
	ENEMY_ROW_CYS,
	enemyCrossRoi,
	enemySubTileRoi,
	enemyWeaponRoi,
	GATE_BRIGHT_MIN_MAX,
	GATE_CLOSE_DARK_PROBES,
	GATE_CLOSE_X_BRIGHT,
	GATE_CLOSE_X_DARK,
	GATE_DARK_MAX_MEAN,
	GATE_SPAWN_BRIGHT,
	GATE_SPAWN_DARK_PROBES,
	GATE_SPECTATOR_X_BRIGHT,
	GATE_SPECTATOR_X_DARK,
	MINIMAP_ABILITY_INK_THRESHOLD,
	MINIMAP_WEAPON_INK_THRESHOLD,
	NAME_BIN_THRESHOLD,
	NAME_TEXT_HEIGHT,
	PRESENCE_MIN_LAPLACIAN,
	SPECIAL_READY_INK_THRESHOLD,
	SPECIAL_READY_MAX_CORNER_SATURATION,
	SPECIAL_READY_MIN_CORNER_MEAN,
	SPECIAL_READY_WEAPON_MIN_SCORE,
	SPECTATOR_ENEMY_DX,
	SPECTATOR_NAME_TEXT_HEIGHTS,
	SPECTATOR_SLOTS,
	spectatorCardLayout,
	WEAPON_BLEED_MIN_CORNER_MEAN,
	WEAPON_MIN_SCORE,
} from "./rois";
import { matchStage, plannerSignature, type StageMatch } from "./stage";

export interface MinimapTeammate {
	/** which callout card: super-jump slot, or the POV player's own card */
	slot: CardSlot;
	/** card name; null when covered by a respawn cross-out or unreadable */
	name: string | null;
	/** sendou main-weapon id; null when unreadable/covered */
	weaponId: MainWeaponId | null;
	/** [head, clothes, shoes] main abilities (null per unreadable badge); empty when crossed out */
	abilities: (AbilityWithUnknown | null)[];
	/** struck through with the respawn cross-out at the read */
	dead: boolean;
	/** on the light camo surface of a charged special at the read */
	specialReady: boolean;
}

export interface MinimapEnemy {
	/** always null on the POV overlay; the spectator screen shows enemy names */
	name: string | null;
	/** readable even on struck rows: the cross-out spares the weapon icon */
	weaponId: MainWeaponId | null;
	abilities: (AbilityWithUnknown | null)[];
	/** struck through with the respawn cross-out at the read */
	dead: boolean;
	/** on the light camo surface of a charged special at the read */
	specialReady: boolean;
}

export interface MinimapData {
	/** matched from the drawn map (stage.ts); null when unconfident or planner signatures not loaded */
	stage: StageId | null;
	/**
	 * casted 8-player spectator screen rather than the POV overlay: alpha (left)
	 * column reported as teammates, bravo (right) as enemy rows, both with names
	 */
	spectator: boolean;
	/** own-team callout cards; a slot missing from the frame is omitted */
	teammates: MinimapTeammate[];
	/** enemy panel rows, top to bottom */
	enemies: MinimapEnemy[];
	/**
	 * mean team-ink RGB per side from the sub-weapon tiles ([alpha, bravo]); null
	 * on too little ink. Anchors the objective counter's sides to `teams` order on
	 * casted footage, which never shows a results screen.
	 */
	teamColors: [InkRgb | null, InkRgb | null];
}

export const MINIMAP_EVENT_TYPE = "Minimap";

/**
 * Timeline content guard: frames in the merge window collapse only while every
 * card/row keeps its dead/special state, so each flip stays its own event.
 * Names/weapons/badges are not compared (OCR wobble is still the same state).
 */
export function sameMinimapStatusData(a: unknown, b: unknown): boolean {
	const da = a as MinimapData;
	const db = b as MinimapData;
	const sameSide = (
		xs: readonly { dead: boolean; specialReady: boolean }[],
		ys: readonly { dead: boolean; specialReady: boolean }[],
	): boolean =>
		xs.length === ys.length &&
		xs.every(
			(x, i) =>
				x.dead === ys[i]!.dead && x.specialReady === ys[i]!.specialReady,
		);
	return (
		sameSide(da.teammates, db.teammates) && sameSide(da.enemies, db.enemies)
	);
}

/** Badge match below this is reported as null (kept in debug). */
const ABILITY_MIN_SCORE = 0.45;

/**
 * Light-camo probe: brightness and saturation of the dimmer 8x8 top corner of
 * the weapon box. Camo brightens both corners (140-165) and is unsaturated; a
 * dark card keeps one corner dark despite bleed or a cross-out stroke, and
 * scene bleed lights both but stays colored.
 */
function minTopCorner(
	gray: Mat,
	hsv: Mat,
	roi: Roi,
): { mean: number; saturation: number } {
	const corners: Roi[] = [
		{ x: roi.x, y: roi.y, w: 8, h: 8 },
		{ x: roi.x + roi.w - 8, y: roi.y, w: 8, h: 8 },
	];
	const means = corners.map((c) => meanBrightness(gray, c));
	const dimmer = corners[means[0]! <= means[1]! ? 0 : 1]!;
	const crop = copyRoi(hsv, dimmer);
	const n = crop.rows * crop.cols;
	let satSum = 0;
	for (let i = 0; i < n; i++) satSum += crop.data[i * 3 + 1]!;
	crop.delete();
	return { mean: Math.min(...means), saturation: satSum / n };
}

/** fraction of the probe that is saturated-and-bright (cross-out strokes) */
function saturatedFraction(hsv: Mat, roi: Roi): number {
	const m = copyRoi(hsv, roi);
	const n = m.rows * m.cols;
	const md = m.data;
	let hit = 0;
	for (let i = 0; i < n; i++) {
		if (
			md[i * 3 + 1]! >= CROSS_SATURATION_MIN &&
			md[i * 3 + 2]! >= CROSS_VALUE_MIN
		) {
			hit++;
		}
	}
	m.delete();
	return hit / n;
}

export function createMinimapDetector(
	resources: ScoreboardResources,
): Detector<MinimapData> {
	const cv = getCV();

	const nameGlyphs: GlyphSet | null = resources.nameGlyphs
		? scaleGlyphSet(
				resources.nameGlyphs,
				NAME_TEXT_HEIGHT / resources.nameGlyphs.height,
			)
		: null;
	const spectatorNameGlyphs: GlyphSet[] = resources.nameGlyphs
		? SPECTATOR_NAME_TEXT_HEIGHTS.map((h) =>
				h === NAME_TEXT_HEIGHT
					? nameGlyphs!
					: scaleGlyphSet(
							resources.nameGlyphs!,
							h / resources.nameGlyphs!.height,
						),
			)
		: [];
	const cardWeapons = resources.minimapCardWeapons ?? null;
	const lightWeapons = resources.minimapLightWeapons ?? null;
	const badges = resources.minimapAbilities ?? null;
	const subWeapons = resources.minimapSubWeapons ?? null;
	const plannerStages = resources.plannerStages ?? null;

	/** Identify the stage from the drawn map; contributes to confidence. */
	function detectStage(frame: Mat, confidences: number[]): StageMatch | null {
		if (!plannerStages?.length) return null;
		const sig = plannerSignature(frame);
		const match = matchStage(sig, plannerStages);
		if (match) confidences.push(match.score);
		return match;
	}

	function probeGate(
		gray: Mat,
		darkProbes: readonly Roi[],
		brightProbes: readonly Roi[],
	): GateResult {
		let darkOk = 0;
		for (const roi of darkProbes) {
			if (meanBrightness(gray, roi) <= GATE_DARK_MAX_MEAN) darkOk++;
		}
		let brightOk = 0;
		for (const roi of brightProbes) {
			if (maxBrightness(gray, roi) >= GATE_BRIGHT_MIN_MAX) brightOk++;
		}
		return {
			pass: darkOk === darkProbes.length && brightOk === brightProbes.length,
			score: (darkOk / darkProbes.length + brightOk / brightProbes.length) / 2,
		};
	}

	/** POV overlay chrome: close-button disc + Spawn Point pill. */
	function overlayGate(gray: Mat): GateResult {
		return probeGate(
			gray,
			[
				...GATE_CLOSE_DARK_PROBES,
				...GATE_CLOSE_X_DARK,
				...GATE_SPAWN_DARK_PROBES,
			],
			[...GATE_CLOSE_X_BRIGHT, GATE_SPAWN_BRIGHT],
		);
	}

	/** Spectator screen: the X jump-button disc beside the 8th player card. */
	function spectatorGate(gray: Mat): GateResult {
		return probeGate(gray, GATE_SPECTATOR_X_DARK, GATE_SPECTATOR_X_BRIGHT);
	}

	function gate(frame: Mat): GateResult {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
		const overlay = overlayGate(gray);
		const spectator = spectatorGate(gray);
		gray.delete();
		return {
			pass: overlay.pass || spectator.pass,
			score: Math.max(overlay.score, spectator.score),
			variant: spectator.pass ? "spectator" : "overlay",
		};
	}

	function matchBadges(
		rgb: Mat,
		centers: readonly (readonly [number, number])[],
		inkThreshold: number,
		confidences: number[],
		debugRow: (WeaponMatch | null)[],
	): (AbilityWithUnknown | null)[] {
		if (!badges) return [null, null, null];
		return centers.map(([cx, cy]) => {
			const crop = cropRoi(rgb, badgeRoi(cx, cy));
			const match = matchWeapon(crop, badges, { inkThreshold });
			crop.delete();
			debugRow.push(match);
			confidences.push(Math.max(0, match.score));
			return match.score >= ABILITY_MIN_SCORE
				? toAbilityWithUnknown(match.id)
				: null;
		});
	}

	/**
	 * Weapon match against the composite set for the surface behind it; on a
	 * bright-bleed surface (WEAPON_BLEED_MIN_CORNER_MEAN) both sets, better wins.
	 */
	function matchSurfaceWeapon(
		rgb: Mat,
		roi: Roi,
		lightSurface: boolean,
		cornerMin: number,
	): WeaponMatch | null {
		const darkThreshold = Math.max(
			MINIMAP_WEAPON_INK_THRESHOLD,
			Math.round(cornerMin) + 50,
		);
		const crop = cropRoi(rgb, roi);
		let match: WeaponMatch | null = null;
		if (lightSurface) {
			match = lightWeapons
				? matchWeapon(crop, lightWeapons, {
						inkThreshold: SPECIAL_READY_INK_THRESHOLD,
					})
				: null;
		} else {
			match = cardWeapons
				? matchWeapon(crop, cardWeapons, { inkThreshold: darkThreshold })
				: null;
			if (lightWeapons && cornerMin >= WEAPON_BLEED_MIN_CORNER_MEAN) {
				const bleed = matchWeapon(crop, lightWeapons, {
					inkThreshold: SPECIAL_READY_INK_THRESHOLD,
				});
				if (match === null || bleed.score > match.score) match = bleed;
			}
		}
		crop.delete();
		return match;
	}

	/** The score floor for the surface the weapon was matched over. */
	function weaponScoreFloor(lightSurface: boolean, cornerMin: number): number {
		return lightSurface || cornerMin >= WEAPON_BLEED_MIN_CORNER_MEAN
			? SPECIAL_READY_WEAPON_MIN_SCORE
			: WEAPON_MIN_SCORE;
	}

	/**
	 * Near-tied icons whose kits differ by sub (plain vs Custom Dualie Squelchers):
	 * the sub tile breaks the tie; shape-only matching survives tint, camo and cross-out.
	 */
	function resolveTieBySubTile(
		rgb: Mat,
		weapon: WeaponMatch,
		tile: Roi,
	): WeaponMatch {
		if (!subWeapons?.length || !tiedWeaponsWithDistinctSubs(weapon))
			return weapon;
		const crop = cropRoi(rgb, tile);
		const sub = matchSpecial(crop, subWeapons);
		crop.delete();
		return disambiguateWeaponBySub(weapon, sub);
	}

	/** Try the name band at each spectator glyph height; best read wins. */
	function bestNameRead(gray: Mat, roi: Roi): ParsedName | null {
		let best: ParsedName | null = null;
		for (const set of spectatorNameGlyphs) {
			const band = copyRoi(gray, roi);
			const parsed = parseName(band, set, { binThreshold: NAME_BIN_THRESHOLD });
			band.delete();
			if (!best || parsed.confidence > best.confidence) best = parsed;
		}
		return best;
	}

	/** The spectator 8-card grid has its own ROIs (the overlay parse reads phantom cards on it). */
	function parseSpectator(
		frame: Mat,
		gray: Mat,
		t: number,
	): DetectedEvent<MinimapData>[] {
		const rgb = new cv.Mat();
		cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);
		const hsv = new cv.Mat();
		cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
		const lap = laplacianAbs(gray);

		const confidences: number[] = [];
		const debug: Record<string, unknown> = { spectator: true };

		const teammates: MinimapTeammate[] = [];
		const enemies: MinimapEnemy[] = [];
		const sideSubTiles: [Roi[], Roi[]] = [[], []];
		const cardDebug: Record<string, unknown>[] = [];
		for (const dx of [0, SPECTATOR_ENEMY_DX]) {
			for (let row = 0; row < 4; row++) {
				const layout = spectatorCardLayout(row, dx);
				const presence = meanBrightness(lap, layout.name);
				if (presence < PRESENCE_MIN_LAPLACIAN) {
					cardDebug.push({ dx, row, presence, skipped: true });
					continue;
				}
				sideSubTiles[dx === 0 ? 0 : 1].push(layout.subTile);
				const crossFraction = saturatedFraction(hsv, layout.cross);
				const crossLap = meanBrightness(lap, layout.cross);
				const occluded =
					crossFraction >= CROSS_MIN_FRACTION &&
					crossLap >= CROSS_MIN_LAPLACIAN;
				const corner = minTopCorner(gray, hsv, layout.weapon);
				const cornerMin = corner.mean;
				const lightSurface =
					corner.mean >= SPECIAL_READY_MIN_CORNER_MEAN &&
					corner.saturation <= SPECIAL_READY_MAX_CORNER_SATURATION;

				let name: string | null = null;
				let nameRaw = "";
				let weapon: WeaponMatch | null = null;
				const badgeDebug: (WeaponMatch | null)[] = [];
				let abilities: (AbilityWithUnknown | null)[] = [];
				// the spectator cross-out sits clear of the weapon ROI, so it stays readable when struck
				weapon = matchSurfaceWeapon(
					rgb,
					layout.weapon,
					lightSurface,
					cornerMin,
				);
				if (weapon) {
					weapon = resolveTieBySubTile(rgb, weapon, layout.subTile);
					confidences.push(Math.max(0, weapon.score));
				}
				if (!occluded) {
					const parsed = bestNameRead(gray, layout.name);
					if (parsed) {
						nameRaw = parsed.raw.text;
						if (parsed.name.length > 0) name = parsed.name;
						confidences.push(parsed.confidence);
					}
					abilities = matchBadges(
						rgb,
						layout.badges,
						Math.max(MINIMAP_ABILITY_INK_THRESHOLD, Math.round(cornerMin) + 50),
						confidences,
						badgeDebug,
					);
				}
				cardDebug.push({
					dx,
					row,
					presence,
					crossFraction,
					crossLap,
					occluded,
					cornerMin,
					lightSurface,
					nameRaw,
					weapon,
					badges: badgeDebug,
				});

				const floor = weaponScoreFloor(lightSurface, cornerMin);
				const matched =
					weapon !== null && weapon.score >= floor ? weapon : null;
				const fields = {
					name,
					weaponId: matched ? toMainWeaponId(matched.id) : null,
					abilities,
					dead: occluded,
					specialReady: lightSurface,
				};
				if (dx === 0) {
					teammates.push({ slot: SPECTATOR_SLOTS[row]!, ...fields });
				} else {
					enemies.push(fields);
				}
			}
		}
		debug.cards = cardDebug;

		const teamColors: [InkRgb | null, InkRgb | null] = [
			meanInkColor(rgb, sideSubTiles[0]),
			meanInkColor(rgb, sideSubTiles[1]),
		];

		const stageMatch = detectStage(frame, confidences);
		debug.stage = stageMatch;

		rgb.delete();
		hsv.delete();
		lap.delete();

		const confidence =
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0;

		return [
			{
				type: MINIMAP_EVENT_TYPE,
				t,
				confidence,
				data: {
					stage: stageMatch?.stageId ?? null,
					spectator: true,
					teammates,
					enemies,
					teamColors,
				},
				debug,
			},
		];
	}

	function parse(
		frame: Mat,
		t: number,
		gateResult?: GateResult,
	): DetectedEvent<MinimapData>[] {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

		const isSpectator = gateResult?.variant
			? gateResult.variant === "spectator"
			: spectatorGate(gray).pass;
		if (isSpectator) {
			const events = parseSpectator(frame, gray, t);
			gray.delete();
			return events;
		}

		const rgb = new cv.Mat();
		cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);
		const hsv = new cv.Mat();
		cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
		const lap = laplacianAbs(gray);

		const confidences: number[] = [];
		const debug: Record<string, unknown> = {};

		// 1. own-team callout cards
		const teammates: MinimapTeammate[] = [];
		const sideSubTiles: [Roi[], Roi[]] = [[], []];
		const cardDebug: Record<string, unknown>[] = [];
		for (const layout of CARD_LAYOUTS) {
			// presence: the card is crisp UI, absent slots show blurred scene
			const presence = meanBrightness(lap, layout.name);
			if (presence < PRESENCE_MIN_LAPLACIAN) {
				cardDebug.push({ slot: layout.slot, presence, skipped: true });
				continue;
			}
			const crossFraction = saturatedFraction(hsv, layout.cross);
			const crossLap = meanBrightness(lap, layout.cross);
			const occluded =
				crossFraction >= CROSS_MIN_FRACTION && crossLap >= CROSS_MIN_LAPLACIAN;
			const corner = minTopCorner(gray, hsv, layout.weapon);
			const cornerMin = corner.mean;
			const lightSurface =
				corner.mean >= SPECIAL_READY_MIN_CORNER_MEAN &&
				corner.saturation <= SPECIAL_READY_MAX_CORNER_SATURATION;

			let name: string | null = null;
			let nameRaw = "";
			let weapon: WeaponMatch | null = null;
			const badgeDebug: (WeaponMatch | null)[] = [];
			let abilities: (AbilityWithUnknown | null)[] = [];
			if (!occluded) {
				if (nameGlyphs) {
					const band = copyRoi(gray, layout.name);
					const parsed = parseName(band, nameGlyphs, {
						binThreshold: NAME_BIN_THRESHOLD,
					});
					band.delete();
					nameRaw = parsed.raw.text;
					if (parsed.name.length > 0) name = parsed.name;
					confidences.push(parsed.confidence);
				}
				weapon = matchSurfaceWeapon(
					rgb,
					layout.weapon,
					lightSurface,
					cornerMin,
				);
				if (weapon) {
					weapon = resolveTieBySubTile(rgb, weapon, layout.subTile);
					confidences.push(Math.max(0, weapon.score));
				}
				abilities = matchBadges(
					rgb,
					layout.badges,
					lightSurface
						? Math.max(
								MINIMAP_ABILITY_INK_THRESHOLD,
								Math.round(cornerMin) + 50,
							)
						: MINIMAP_ABILITY_INK_THRESHOLD,
					confidences,
					badgeDebug,
				);
			}
			cardDebug.push({
				slot: layout.slot,
				presence,
				crossFraction,
				crossLap,
				occluded,
				cornerMin,
				cornerSaturation: corner.saturation,
				lightSurface,
				nameRaw,
				weapon,
				badges: badgeDebug,
			});

			const floor = weaponScoreFloor(lightSurface, cornerMin);
			const matched = weapon !== null && weapon.score >= floor ? weapon : null;
			// an occluding cross-out is itself proof the card is drawn
			const hasEvidence =
				occluded ||
				name !== null ||
				matched !== null ||
				abilities.some((a) => a !== null);
			if (!hasEvidence) continue;
			sideSubTiles[0].push(layout.subTile);
			teammates.push({
				slot: layout.slot,
				name,
				weaponId: matched ? toMainWeaponId(matched.id) : null,
				abilities,
				dead: occluded,
				specialReady: lightSurface,
			});
		}
		debug.cards = cardDebug;

		// 2. enemy panel rows
		const enemies: MinimapEnemy[] = [];
		const enemyDebug: Record<string, unknown>[] = [];
		for (const cy of ENEMY_ROW_CYS) {
			const weaponRoi = enemyWeaponRoi(cy);
			const presence = meanBrightness(lap, weaponRoi);
			if (presence < PRESENCE_MIN_LAPLACIAN) {
				enemyDebug.push({ cy, presence, skipped: true });
				continue;
			}
			const crossFraction = saturatedFraction(hsv, enemyCrossRoi(cy));
			const crossLap = meanBrightness(lap, enemyCrossRoi(cy));
			const occluded =
				crossFraction >= CROSS_MIN_FRACTION && crossLap >= CROSS_MIN_LAPLACIAN;

			// light camo rows: pick template variant by corner brightness, raise ink threshold past it
			const corner = minTopCorner(gray, hsv, weaponRoi);
			const cornerMin = corner.mean;
			const lightSurface =
				corner.mean >= SPECIAL_READY_MIN_CORNER_MEAN &&
				corner.saturation <= SPECIAL_READY_MAX_CORNER_SATURATION;
			let weapon = matchSurfaceWeapon(rgb, weaponRoi, lightSurface, cornerMin);
			if (weapon) {
				weapon = resolveTieBySubTile(rgb, weapon, enemySubTileRoi(cy));
				confidences.push(Math.max(0, weapon.score));
			}
			const badgeDebug: (WeaponMatch | null)[] = [];
			const abilities: (AbilityWithUnknown | null)[] = occluded
				? []
				: matchBadges(
						rgb,
						ENEMY_BADGE_XS.map((cx) => [cx, cy] as const),
						Math.max(MINIMAP_ABILITY_INK_THRESHOLD, Math.round(cornerMin) + 50),
						confidences,
						badgeDebug,
					);
			enemyDebug.push({
				cy,
				presence,
				crossFraction,
				crossLap,
				occluded,
				lightSurface,
				cornerMin,
				cornerSaturation: corner.saturation,
				weapon,
				badges: badgeDebug,
			});

			const floor = weaponScoreFloor(lightSurface, cornerMin);
			const matched = weapon !== null && weapon.score >= floor ? weapon : null;
			sideSubTiles[1].push(enemySubTileRoi(cy));
			enemies.push({
				name: null,
				weaponId: matched ? toMainWeaponId(matched.id) : null,
				abilities,
				dead: occluded,
				specialReady: lightSurface,
			});
		}
		debug.enemies = enemyDebug;

		const teamColors: [InkRgb | null, InkRgb | null] = [
			meanInkColor(rgb, sideSubTiles[0]),
			meanInkColor(rgb, sideSubTiles[1]),
		];

		const stageMatch = detectStage(frame, confidences);
		debug.stage = stageMatch;

		gray.delete();
		rgb.delete();
		hsv.delete();
		lap.delete();

		const confidence =
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0;

		return [
			{
				type: MINIMAP_EVENT_TYPE,
				t,
				confidence,
				data: {
					stage: stageMatch?.stageId ?? null,
					spectator: false,
					teammates,
					enemies,
					teamColors,
				},
				debug,
			},
		];
	}

	// sufficientConfidence sits just under the lowest confirmed scan read (fixtures
	// 0.746-0.800, scan events down to 0.699) so nearly every overlay suppresses
	// after one parse; stagnation can't be relied on since a map-open's confidence
	// keeps fluctuating upward, which once re-ran the ~4s parse until the worker
	// starved the frame queue (2026-08-23 Mincemeat: last 95s of counter reads
	// lost). The rearm cooldown covers gate flicker like death's does.
	return {
		id: "minimap",
		refineIntervalS: 0.4,
		sufficientConfidence: 0.69,
		rearmCooldownS: 5,
		gate,
		parse,
	};
}
