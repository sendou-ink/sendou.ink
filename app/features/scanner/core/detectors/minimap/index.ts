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
import type { Mat } from "../../cv";
import { type GlyphSet, scaleGlyphSet } from "../../glyphs";
import {
	copyRoi,
	cropRoi,
	frameGray,
	frameHsv,
	frameRgb,
	laplacianAbs,
	maxBrightness,
	meanBrightness,
	type Roi,
} from "../../image";
import { type InkRgb, meanInkColor } from "../../ink-color";
import { all, done, type MatchSteps, runSync } from "../../match-steps";
import type { ScoreboardResources } from "../scoreboard/index";
import { type ParsedName, parseNameSteps } from "../scoreboard/names";
import {
	disambiguateWeaponBySub,
	matchSpecialSteps,
	tiedWeaponsWithDistinctSubs,
} from "../scoreboard/specials";
import { matchWeaponSteps, type WeaponMatch } from "../scoreboard/weapons";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	badgeRoi,
	CARD_LAYOUTS,
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
	GATE_SPECTATOR_X_MIRRORED_BRIGHT,
	GATE_SPECTATOR_X_MIRRORED_DARK,
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
	spectatorCardLayout,
	WEAPON_BLEED_MIN_CORNER_MEAN,
	WEAPON_MIN_SCORE,
} from "./rois";
import { matchStage, plannerSignature, type StageMatch } from "./stage";

export interface MinimapTeammate {
	/** the POV player's own card (bottom-left on the overlay); never on the spectator screen */
	self: boolean;
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
	/** own-team callout cards in drawn order; a card missing from the frame is omitted */
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

	/** Spectator screen: the X jump-button disc beside the 8th player card, in whichever column carries the face buttons. */
	function spectatorGate(gray: Mat): GateResult {
		const right = probeGate(
			gray,
			GATE_SPECTATOR_X_DARK,
			GATE_SPECTATOR_X_BRIGHT,
		);
		if (right.pass) return right;
		const left = probeGate(
			gray,
			GATE_SPECTATOR_X_MIRRORED_DARK,
			GATE_SPECTATOR_X_MIRRORED_BRIGHT,
		);
		return left.score > right.score ? left : right;
	}

	function gate(frame: Mat): GateResult {
		const gray = frameGray(frame);
		const overlay = overlayGate(gray);
		const spectator = spectatorGate(gray);
		return {
			pass: overlay.pass || spectator.pass,
			score: Math.max(overlay.score, spectator.score),
			variant: spectator.pass ? "spectator" : "overlay",
		};
	}

	/** Badge matches in `centers` order (null when no badge templates), read in one lockstep. */
	function* matchBadgesSteps(
		rgb: Mat,
		centers: readonly (readonly [number, number])[],
		inkThreshold: number,
	): MatchSteps<WeaponMatch[] | null> {
		if (!badges) return null;
		const crops = centers.map(([cx, cy]) => cropRoi(rgb, badgeRoi(cx, cy)));
		const matches = yield* all(
			crops.map((crop) => matchWeaponSteps(crop, badges, { inkThreshold })),
		);
		for (const crop of crops) crop.delete();
		return matches;
	}

	/** Badge matches as abilities, their confidences and debug appended in order. */
	function badgeAbilities(
		matches: WeaponMatch[] | null,
		confidences: number[],
		debugRow: (WeaponMatch | null)[],
	): (AbilityWithUnknown | null)[] {
		if (!matches) return [null, null, null];
		return matches.map((match) => {
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
	 * Near-tied icons whose kits differ by sub (plain vs Custom Dualie Squelchers)
	 * are then re-decided by the sub tile (`tile`); shape-only matching survives
	 * tint, camo and cross-out.
	 */
	function* matchSurfaceWeaponSteps(
		rgb: Mat,
		roi: Roi,
		tile: Roi,
		lightSurface: boolean,
		cornerMin: number,
	): MatchSteps<WeaponMatch | null> {
		const darkThreshold = Math.max(
			MINIMAP_WEAPON_INK_THRESHOLD,
			Math.round(cornerMin) + 50,
		);
		const crop = cropRoi(rgb, roi);
		let match: WeaponMatch | null = null;
		if (lightSurface) {
			match = lightWeapons
				? yield* matchWeaponSteps(crop, lightWeapons, {
						inkThreshold: SPECIAL_READY_INK_THRESHOLD,
					})
				: null;
		} else {
			const [card, bleed] = yield* all([
				cardWeapons
					? matchWeaponSteps(crop, cardWeapons, { inkThreshold: darkThreshold })
					: done(null),
				lightWeapons && cornerMin >= WEAPON_BLEED_MIN_CORNER_MEAN
					? matchWeaponSteps(crop, lightWeapons, {
							inkThreshold: SPECIAL_READY_INK_THRESHOLD,
						})
					: done(null),
			]);
			match = card;
			if (bleed && (match === null || bleed.score > match.score)) match = bleed;
		}
		crop.delete();
		if (!match || !subWeapons?.length || !tiedWeaponsWithDistinctSubs(match)) {
			return match;
		}
		const tileCrop = cropRoi(rgb, tile);
		const sub = yield* matchSpecialSteps(tileCrop, subWeapons);
		tileCrop.delete();
		return disambiguateWeaponBySub(match, sub);
	}

	/** The score floor for the surface the weapon was matched over. */
	function weaponScoreFloor(lightSurface: boolean, cornerMin: number): number {
		return lightSurface || cornerMin >= WEAPON_BLEED_MIN_CORNER_MEAN
			? SPECIAL_READY_WEAPON_MIN_SCORE
			: WEAPON_MIN_SCORE;
	}

	function* readCardName(
		gray: Mat,
		roi: Roi,
		glyphs: GlyphSet,
		speculative: boolean,
	): MatchSteps<ParsedName> {
		const band = copyRoi(gray, roi);
		const parsed = yield* parseNameSteps(
			band,
			glyphs,
			{ binThreshold: NAME_BIN_THRESHOLD },
			speculative,
		);
		band.delete();
		return parsed;
	}

	/** Try the name band at each spectator glyph height (in lockstep); best read wins. */
	function* bestNameRead(
		gray: Mat,
		roi: Roi,
		speculative: boolean,
	): MatchSteps<ParsedName | null> {
		const band = copyRoi(gray, roi);
		const reads = yield* all(
			spectatorNameGlyphs.map((set) =>
				parseNameSteps(
					band,
					set,
					{ binThreshold: NAME_BIN_THRESHOLD },
					speculative,
				),
			),
		);
		band.delete();
		let best: ParsedName | null = null;
		for (const parsed of reads) {
			if (!best || parsed.confidence > best.confidence) best = parsed;
		}
		return best;
	}

	/** The spectator 8-card grid has its own ROIs (the overlay parse reads phantom cards on it); every card reads in one lockstep. */
	function* parseSpectatorSteps(
		frame: Mat,
		gray: Mat,
		t: number,
		speculative: boolean,
	): MatchSteps<DetectedEvent<MinimapData>[]> {
		const rgb = frameRgb(frame);
		const hsv = frameHsv(frame);
		const lap = laplacianAbs(gray);

		const confidences: number[] = [];
		const debug: Record<string, unknown> = { spectator: true };

		const teammates: MinimapTeammate[] = [];
		const enemies: MinimapEnemy[] = [];
		const sideSubTiles: [Roi[], Roi[]] = [[], []];
		const cardDebug: Record<string, unknown>[] = [];
		const cards = [0, SPECTATOR_ENEMY_DX].flatMap((dx) =>
			[0, 1, 2, 3].map((row) => {
				const layout = spectatorCardLayout(row, dx);
				const presence = meanBrightness(lap, layout.name);
				if (presence < PRESENCE_MIN_LAPLACIAN) {
					return { dx, row, layout, presence, probes: null };
				}
				const crossFraction = saturatedFraction(hsv, layout.cross);
				const crossLap = meanBrightness(lap, layout.cross);
				const occluded =
					crossFraction >= CROSS_MIN_FRACTION &&
					crossLap >= CROSS_MIN_LAPLACIAN;
				const corner = minTopCorner(gray, hsv, layout.weapon);
				const lightSurface =
					corner.mean >= SPECIAL_READY_MIN_CORNER_MEAN &&
					corner.saturation <= SPECIAL_READY_MAX_CORNER_SATURATION;
				return {
					dx,
					row,
					layout,
					presence,
					probes: {
						crossFraction,
						crossLap,
						occluded,
						cornerMin: corner.mean,
						lightSurface,
					},
				};
			}),
		);
		const reads = yield* all(
			cards.map(({ layout, probes }) =>
				all([
					// the spectator cross-out sits clear of the weapon ROI, so it stays readable when struck
					probes
						? matchSurfaceWeaponSteps(
								rgb,
								layout.weapon,
								layout.subTile,
								probes.lightSurface,
								probes.cornerMin,
							)
						: done(null),
					probes && !probes.occluded
						? bestNameRead(gray, layout.name, speculative)
						: done(null),
					probes && !probes.occluded
						? matchBadgesSteps(
								rgb,
								layout.badges,
								Math.max(
									MINIMAP_ABILITY_INK_THRESHOLD,
									Math.round(probes.cornerMin) + 50,
								),
							)
						: done(null),
				]),
			),
		);
		for (const [i, { dx, row, layout, presence, probes }] of cards.entries()) {
			if (!probes) {
				cardDebug.push({ dx, row, presence, skipped: true });
				continue;
			}
			const isTeammate = dx === 0;
			sideSubTiles[isTeammate ? 0 : 1].push(layout.subTile);
			const { crossFraction, crossLap, occluded, cornerMin, lightSurface } =
				probes;
			const [weapon, parsed, badgeMatches] = reads[i]!;

			let name: string | null = null;
			let nameRaw = "";
			const badgeDebug: (WeaponMatch | null)[] = [];
			let abilities: (AbilityWithUnknown | null)[] = [];
			if (weapon) confidences.push(Math.max(0, weapon.score));
			if (!occluded) {
				if (parsed) {
					nameRaw = parsed.raw.text;
					if (parsed.name.length > 0) name = parsed.name;
					confidences.push(parsed.confidence);
				}
				abilities = badgeAbilities(badgeMatches, confidences, badgeDebug);
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
			const matched = weapon !== null && weapon.score >= floor ? weapon : null;
			const fields = {
				name,
				weaponId: matched ? toMainWeaponId(matched.id) : null,
				abilities,
				dead: occluded,
				specialReady: lightSurface,
			};
			if (isTeammate) {
				teammates.push({ self: false, ...fields });
			} else {
				enemies.push(fields);
			}
		}
		debug.cards = cardDebug;

		const teamColors: [InkRgb | null, InkRgb | null] = [
			meanInkColor(rgb, sideSubTiles[0]),
			meanInkColor(rgb, sideSubTiles[1]),
		];

		const stageMatch = detectStage(frame, confidences);
		debug.stage = stageMatch;

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

	function* parseSteps(
		frame: Mat,
		t: number,
		gateResult: GateResult | undefined,
		speculative: boolean,
	): MatchSteps<DetectedEvent<MinimapData>[]> {
		const gray = frameGray(frame);

		const isSpectator = gateResult?.variant
			? gateResult.variant === "spectator"
			: spectatorGate(gray).pass;
		if (isSpectator) {
			const events = yield* parseSpectatorSteps(frame, gray, t, speculative);
			return events;
		}

		const rgb = frameRgb(frame);
		const hsv = frameHsv(frame);
		const lap = laplacianAbs(gray);

		const confidences: number[] = [];
		const debug: Record<string, unknown> = {};

		// 1. own-team callout cards and 2. enemy panel rows, probed first, then
		// every field of every card in one lockstep
		const cards = CARD_LAYOUTS.map((layout) => {
			// presence: the card is crisp UI, an absent card shows blurred scene
			const presence = meanBrightness(lap, layout.name);
			if (presence < PRESENCE_MIN_LAPLACIAN) {
				return { layout, presence, probes: null };
			}
			const crossFraction = saturatedFraction(hsv, layout.cross);
			const crossLap = meanBrightness(lap, layout.cross);
			const occluded =
				crossFraction >= CROSS_MIN_FRACTION && crossLap >= CROSS_MIN_LAPLACIAN;
			const corner = minTopCorner(gray, hsv, layout.weapon);
			const lightSurface =
				corner.mean >= SPECIAL_READY_MIN_CORNER_MEAN &&
				corner.saturation <= SPECIAL_READY_MAX_CORNER_SATURATION;
			return {
				layout,
				presence,
				probes: { crossFraction, crossLap, occluded, corner, lightSurface },
			};
		});
		const rows = ENEMY_ROW_CYS.map((cy) => {
			const weaponRoi = enemyWeaponRoi(cy);
			const presence = meanBrightness(lap, weaponRoi);
			if (presence < PRESENCE_MIN_LAPLACIAN) {
				return { cy, weaponRoi, presence, probes: null };
			}
			const crossFraction = saturatedFraction(hsv, enemyCrossRoi(cy));
			const crossLap = meanBrightness(lap, enemyCrossRoi(cy));
			const occluded =
				crossFraction >= CROSS_MIN_FRACTION && crossLap >= CROSS_MIN_LAPLACIAN;
			// light camo rows: pick template variant by corner brightness, raise ink threshold past it
			const corner = minTopCorner(gray, hsv, weaponRoi);
			const lightSurface =
				corner.mean >= SPECIAL_READY_MIN_CORNER_MEAN &&
				corner.saturation <= SPECIAL_READY_MAX_CORNER_SATURATION;
			return {
				cy,
				weaponRoi,
				presence,
				probes: { crossFraction, crossLap, occluded, corner, lightSurface },
			};
		});
		const [cardReads, rowReads] = yield* all([
			all(
				cards.map(({ layout, probes }) =>
					probes && !probes.occluded
						? all([
								nameGlyphs
									? readCardName(gray, layout.name, nameGlyphs, speculative)
									: done(null),
								matchSurfaceWeaponSteps(
									rgb,
									layout.weapon,
									layout.subTile,
									probes.lightSurface,
									probes.corner.mean,
								),
								matchBadgesSteps(
									rgb,
									layout.badges,
									probes.lightSurface
										? Math.max(
												MINIMAP_ABILITY_INK_THRESHOLD,
												Math.round(probes.corner.mean) + 50,
											)
										: MINIMAP_ABILITY_INK_THRESHOLD,
								),
							])
						: done(null),
				),
			),
			all(
				rows.map(({ cy, weaponRoi, probes }) =>
					probes
						? all([
								matchSurfaceWeaponSteps(
									rgb,
									weaponRoi,
									enemySubTileRoi(cy),
									probes.lightSurface,
									probes.corner.mean,
								),
								probes.occluded
									? done(null)
									: matchBadgesSteps(
											rgb,
											ENEMY_BADGE_XS.map((cx) => [cx, cy] as const),
											Math.max(
												MINIMAP_ABILITY_INK_THRESHOLD,
												Math.round(probes.corner.mean) + 50,
											),
										),
							])
						: done(null),
				),
			),
		]);

		const teammates: MinimapTeammate[] = [];
		const sideSubTiles: [Roi[], Roi[]] = [[], []];
		const cardDebug: Record<string, unknown>[] = [];
		for (const [i, { layout, presence, probes }] of cards.entries()) {
			if (!probes) {
				cardDebug.push({ self: layout.self, presence, skipped: true });
				continue;
			}
			const { crossFraction, crossLap, occluded, corner, lightSurface } =
				probes;
			const cornerMin = corner.mean;

			let name: string | null = null;
			let nameRaw = "";
			let weapon: WeaponMatch | null = null;
			const badgeDebug: (WeaponMatch | null)[] = [];
			let abilities: (AbilityWithUnknown | null)[] = [];
			const read = cardReads[i];
			if (read) {
				const [parsed, matchedWeapon, badgeMatches] = read;
				if (parsed) {
					nameRaw = parsed.raw.text;
					if (parsed.name.length > 0) name = parsed.name;
					confidences.push(parsed.confidence);
				}
				weapon = matchedWeapon;
				if (weapon) confidences.push(Math.max(0, weapon.score));
				abilities = badgeAbilities(badgeMatches, confidences, badgeDebug);
			}
			cardDebug.push({
				self: layout.self,
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
				self: layout.self,
				name,
				weaponId: matched ? toMainWeaponId(matched.id) : null,
				abilities,
				dead: occluded,
				specialReady: lightSurface,
			});
		}
		debug.cards = cardDebug;

		const enemies: MinimapEnemy[] = [];
		const enemyDebug: Record<string, unknown>[] = [];
		for (const [i, { cy, presence, probes }] of rows.entries()) {
			const read = rowReads[i];
			if (!probes || !read) {
				enemyDebug.push({ cy, presence, skipped: true });
				continue;
			}
			const { crossFraction, crossLap, occluded, corner, lightSurface } =
				probes;
			const cornerMin = corner.mean;
			const [weapon, badgeMatches] = read;
			if (weapon) confidences.push(Math.max(0, weapon.score));
			const badgeDebug: (WeaponMatch | null)[] = [];
			const abilities: (AbilityWithUnknown | null)[] = occluded
				? []
				: badgeAbilities(badgeMatches, confidences, badgeDebug);
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
		parse: (frame, t, gateResult) =>
			runSync(parseSteps(frame, t, gateResult, false)),
		parseSteps,
	};
}
