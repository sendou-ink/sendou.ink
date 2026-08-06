/**
 * MinimapDetector: parses the in-match map overlay (opened with X) — the
 * own-team callout cards (name, main weapon, the three main-ability
 * badges), the enemy panel rows (weapon, abilities; the game shows no
 * enemy names) — plus the stage, matched from the drawn map (stage.ts).
 * The goal is the most complete read of every card/row; per-match state
 * (respawn cross-outs, special charge, map control) is deliberately not
 * reported.
 *
 * Two screen states still steer the reads without being emitted:
 * - a respawning player's card is struck through with a large team-color
 *   X that covers the name and badges (own cards also lose the weapon;
 *   enemy rows keep theirs — the X spares the row's weapon icon). Reading
 *   through the X yields garbage, so an occlusion probe skips the covered
 *   fields and reports them null;
 * - a charged special swaps the card/row background for a light camo
 *   pattern; weapons are full-color icon art matched against art-cropped
 *   template sets composited for the surface actually behind them — bg-40
 *   for the translucent dark cards/rows, bg-150 for the camo (dark
 *   templates anti-correlate there) — so a corner-brightness probe picks
 *   the template set, ink threshold, and score floor per card.
 */

import type { MainWeaponId, StageId } from "~/modules/in-game-lists/types";
import {
	type ScannerAbility,
	toMainWeaponId,
	toScannerAbility,
} from "../../../scanner-types";
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
	SPECIAL_READY_MIN_CORNER_MEAN,
	SPECIAL_READY_WEAPON_MIN_SCORE,
	SPECTATOR_ENEMY_DX,
	SPECTATOR_NAME_TEXT_HEIGHTS,
	SPECTATOR_SLOTS,
	spectatorCardLayout,
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
	/**
	 * the card's three main abilities, [head, clothes, shoes] (null per
	 * unreadable badge); empty when a respawn cross-out sits over the badges
	 */
	abilities: (ScannerAbility | null)[];
}

export interface MinimapEnemy {
	/**
	 * the POV overlay shows no enemy names (always null there); the
	 * spectator screen does, so spectator rows carry them
	 */
	name: string | null;
	/** readable even on struck rows: the cross-out spares the weapon icon */
	weaponId: MainWeaponId | null;
	abilities: (ScannerAbility | null)[];
}

export interface MinimapData {
	/**
	 * sendou stage id, matched from the drawn map against the planner
	 * renders (stage.ts); null when no stage matched confidently or the
	 * planner signatures were not loaded. The mode is not identifiable this
	 * way (see stage.ts) and is left to the mode-bearing detectors.
	 */
	stage: StageId | null;
	/**
	 * true when the frame is a casted stream's 8-player spectator map screen
	 * rather than the POV overlay: the alpha (left) column is reported as
	 * teammates (d-pad slots up/right/down/left) and the bravo (right)
	 * column as enemy rows — with names, which this screen shows
	 */
	spectator: boolean;
	/** own-team callout cards; a slot missing from the frame is omitted */
	teammates: MinimapTeammate[];
	/** enemy panel rows, top to bottom */
	enemies: MinimapEnemy[];
}

export const MINIMAP_EVENT_TYPE = "Minimap";

/** Badge match below this is reported as null (kept in debug). */
const ABILITY_MIN_SCORE = 0.45;

/**
 * Light-camo (special-charged) probe: min of the two 8x8 top-corner means
 * of the weapon box. Camo backgrounds brighten both corners (140-165); on
 * a dark card at least one stays dark even when avatar bleed or a
 * cross-out stroke lights up the other.
 */
function minTopCornerMean(gray: Mat, roi: Roi): number {
	const corners: Roi[] = [
		{ x: roi.x, y: roi.y, w: 8, h: 8 },
		{ x: roi.x + roi.w - 8, y: roi.y, w: 8, h: 8 },
	];
	return Math.min(...corners.map((c) => meanBrightness(gray, c)));
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
	): (ScannerAbility | null)[] {
		if (!badges) return [null, null, null];
		return centers.map(([cx, cy]) => {
			const crop = cropRoi(rgb, badgeRoi(cx, cy));
			const match = matchWeapon(crop, badges, { inkThreshold });
			crop.delete();
			debugRow.push(match);
			confidences.push(Math.max(0, match.score));
			return match.score >= ABILITY_MIN_SCORE
				? toScannerAbility(match.id)
				: null;
		});
	}

	/**
	 * Near-tied weapon icons whose kits differ by sub (plain vs Custom
	 * Dualie Squelchers): let the card/row's team-tinted sub tile break the
	 * tie. Shape-only matching survives the tint, the camo surface, and a
	 * cross-out stroke clipping the tile.
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

	/**
	 * The spectator screen's 8-card grid doesn't share the overlay's ROIs
	 * (running the overlay parse against it reads phantom cards), so it gets
	 * its own card loop: same fields per card, both columns carry names.
	 */
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
		const cardDebug: Record<string, unknown>[] = [];
		for (const dx of [0, SPECTATOR_ENEMY_DX]) {
			for (let row = 0; row < 4; row++) {
				const layout = spectatorCardLayout(row, dx);
				const presence = meanBrightness(lap, layout.name);
				if (presence < PRESENCE_MIN_LAPLACIAN) {
					cardDebug.push({ dx, row, presence, skipped: true });
					continue;
				}
				const crossFraction = saturatedFraction(hsv, layout.cross);
				const occluded = crossFraction >= CROSS_MIN_FRACTION;
				const cornerMin = minTopCornerMean(gray, layout.weapon);
				const lightSurface = cornerMin >= SPECIAL_READY_MIN_CORNER_MEAN;

				let name: string | null = null;
				let nameRaw = "";
				let weapon: WeaponMatch | null = null;
				const badgeDebug: (WeaponMatch | null)[] = [];
				let abilities: (ScannerAbility | null)[] = [];
				if (!occluded) {
					const parsed = bestNameRead(gray, layout.name);
					if (parsed) {
						nameRaw = parsed.raw.text;
						if (parsed.name.length > 0) name = parsed.name;
						confidences.push(parsed.confidence);
					}
					const templates = lightSurface ? lightWeapons : cardWeapons;
					if (templates) {
						const crop = cropRoi(rgb, layout.weapon);
						weapon = matchWeapon(crop, templates, {
							inkThreshold: lightSurface
								? SPECIAL_READY_INK_THRESHOLD
								: Math.max(
										MINIMAP_WEAPON_INK_THRESHOLD,
										Math.round(cornerMin) + 50,
									),
						});
						crop.delete();
						weapon = resolveTieBySubTile(rgb, weapon, layout.subTile);
						confidences.push(Math.max(0, weapon.score));
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
					occluded,
					cornerMin,
					lightSurface,
					nameRaw,
					weapon,
					badges: badgeDebug,
				});

				const floor = lightSurface
					? SPECIAL_READY_WEAPON_MIN_SCORE
					: WEAPON_MIN_SCORE;
				const matched =
					weapon !== null && weapon.score >= floor ? weapon : null;
				const fields = {
					name,
					weaponId: matched ? toMainWeaponId(matched.id) : null,
					abilities,
				};
				if (dx === 0) {
					teammates.push({ slot: SPECTATOR_SLOTS[row]!, ...fields });
				} else {
					enemies.push(fields);
				}
			}
		}
		debug.cards = cardDebug;

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
		const cardDebug: Record<string, unknown>[] = [];
		for (const layout of CARD_LAYOUTS) {
			// presence: the card is crisp UI, absent slots show blurred scene
			const presence = meanBrightness(lap, layout.name);
			if (presence < PRESENCE_MIN_LAPLACIAN) {
				cardDebug.push({ slot: layout.slot, presence, skipped: true });
				continue;
			}
			const crossFraction = saturatedFraction(hsv, layout.cross);
			const occluded = crossFraction >= CROSS_MIN_FRACTION;
			const cornerMin = minTopCornerMean(gray, layout.weapon);
			const lightSurface = cornerMin >= SPECIAL_READY_MIN_CORNER_MEAN;

			let name: string | null = null;
			let nameRaw = "";
			let weapon: WeaponMatch | null = null;
			const badgeDebug: (WeaponMatch | null)[] = [];
			let abilities: (ScannerAbility | null)[] = [];
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
				const templates = lightSurface ? lightWeapons : cardWeapons;
				if (templates) {
					const crop = cropRoi(rgb, layout.weapon);
					weapon = matchWeapon(crop, templates, {
						inkThreshold: lightSurface
							? SPECIAL_READY_INK_THRESHOLD
							: MINIMAP_WEAPON_INK_THRESHOLD,
					});
					crop.delete();
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
				occluded,
				cornerMin,
				lightSurface,
				nameRaw,
				weapon,
				badges: badgeDebug,
			});

			const floor = lightSurface
				? SPECIAL_READY_WEAPON_MIN_SCORE
				: WEAPON_MIN_SCORE;
			const matched = weapon !== null && weapon.score >= floor ? weapon : null;
			// an occluding cross-out is itself proof the card is drawn
			const hasEvidence =
				occluded ||
				name !== null ||
				matched !== null ||
				abilities.some((a) => a !== null);
			if (!hasEvidence) continue;
			teammates.push({
				slot: layout.slot,
				name,
				weaponId: matched ? toMainWeaponId(matched.id) : null,
				abilities,
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
			const occluded = crossFraction >= CROSS_MIN_FRACTION;

			// light camo rows: pick the template variant by the weapon box's
			// corner brightness and raise the ink threshold past that background
			const cornerMin = minTopCornerMean(gray, weaponRoi);
			const lightSurface = cornerMin >= SPECIAL_READY_MIN_CORNER_MEAN;
			const templates = lightSurface ? lightWeapons : cardWeapons;
			const inkThreshold = lightSurface
				? SPECIAL_READY_INK_THRESHOLD
				: Math.max(MINIMAP_WEAPON_INK_THRESHOLD, Math.round(cornerMin) + 50);

			let weapon: WeaponMatch | null = null;
			if (templates) {
				const crop = cropRoi(rgb, weaponRoi);
				weapon = matchWeapon(crop, templates, { inkThreshold });
				crop.delete();
				weapon = resolveTieBySubTile(rgb, weapon, enemySubTileRoi(cy));
				confidences.push(Math.max(0, weapon.score));
			}
			const badgeDebug: (WeaponMatch | null)[] = [];
			const abilities: (ScannerAbility | null)[] = occluded
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
				occluded,
				lightSurface,
				cornerMin,
				weapon,
				badges: badgeDebug,
			});

			const floor = lightSurface
				? SPECIAL_READY_WEAPON_MIN_SCORE
				: WEAPON_MIN_SCORE;
			const matched = weapon !== null && weapon.score >= floor ? weapon : null;
			enemies.push({
				name: null,
				weaponId: matched ? toMainWeaponId(matched.id) : null,
				abilities,
			});
		}
		debug.enemies = enemyDebug;

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
				},
				debug,
			},
		];
	}

	// sufficientConfidence sits just under the measured clean-read floor
	// (fixtures 0.746-0.800; confirmed scan events reach down to 0.699, and
	// those below the floor fall back to stagnation). The refine override
	// matters here because a map-open's confidence keeps fluctuating upward,
	// resetting the stagnation counter — without it a ~0.9s parse runs at
	// the dense cadence for the whole map-open
	return {
		id: "minimap",
		refineIntervalS: 0.4,
		sufficientConfidence: 0.73,
		gate,
		parse,
	};
}
