/**
 * ScoreboardDetector: parses the end-of-match results scoreboard
 * (team scores + 8 rows of weapon / name / paint / splats / deaths / specials).
 */
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { ScannerLobby } from "../../../scanner-types";
import { getCV, type Mat } from "../../cv";
import { type GlyphSet, scaleGlyphSet } from "../../glyphs";
import { cropRoi, maxBrightness, meanBrightness } from "../../image";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	FULL_COUNT_TEAM_SCORE,
	parseBannerScore,
	resolveMatchScores,
} from "./banner";
import { parseNumber } from "./digits";
import { type ParsedHeader, parseHeader } from "./header";
import { findPovIndex } from "./pov";
import {
	GATE_DARK_MAX_MEAN,
	GATE_PANEL_MAX_MEAN,
	GATE_PANEL_PROBES,
	GATE_TEXT_MIN_MAX,
	gateDarkProbe,
	MATCH_SCORE_DIGIT_HEIGHTS,
	MATCH_SCORE_ROIS,
	nameRoi,
	PAINT_DIGIT_HEIGHT,
	paintRoi,
	paintSuffixRoi,
	povArrowRoi,
	ROW_CENTERS,
	specialIconRoi,
	statRoi,
	TEAM_DIGIT_HEIGHT,
	TEAM_SCORE_ROIS,
	weaponRoi,
} from "./rois";
import { parseScoreboardRow, type RowRois } from "./row";
import type { SpecialMatch, SpecialTemplate } from "./specials";
import type { WeaponMatch, WeaponTemplate } from "./weapons";

export interface ScoreboardPlayer {
	name: string;
	/** sendou main-weapon id; null when the row's weapon was unreadable */
	weaponId: MainWeaponId | null;
	paint: number | null;
	/** kills+assists (the combined counter as shown) */
	ka: number | null;
	d: number | null;
	s: number | null;
}

export interface ScoreboardData {
	/** from the header tag; null when unreadable */
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	stage: StageId | null;
	/**
	 * the "Score:" banner game scores, [winner, loser]; a knockout's winner
	 * reports 100 (the burst hides the real banner)
	 */
	matchScores: [number | null, number | null];
	/** 8 players: rows 0-3 winning team, rows 4-7 losing team */
	players: ScoreboardPlayer[];
	/**
	 * index into `players` of the recording player's row, marked by the
	 * yellow arrow; null when no arrow is found (spectator/overhead footage)
	 */
	povIndex: number | null;
}

export interface ScoreboardRowDebug {
	weapon: WeaponMatch | null;
	/** row's special icon match, when it was consulted for a weapon tie */
	special?: SpecialMatch;
	paintScore: number;
	nameScore: number;
	statScores: [number, number, number];
	/** fraction of the row's POV-arrow probe that is arrow-yellow */
	povFraction: number;
}

export interface ScoreboardResources {
	weapons: WeaponTemplate[];
	/**
	 * Weapon renders prepared for the in-match icon strip (objective's
	 * StripWeapons evidence). Optional: without them the strip slot →
	 * scoreboard row assignment falls back to as-drawn order.
	 */
	stripWeapons?: WeaponTemplate[] | null;
	/**
	 * Special-weapon silhouettes (assets/cv/specials). Optional: without
	 * them, near-tied weapon icons (Splash- vs Sploosh-o-matic) stay decided
	 * by icon score alone.
	 */
	specials?: SpecialTemplate[] | null;
	/** digit templates at paint size (h~28); team scores reuse these, scaled */
	paintDigits: GlyphSet | null;
	/** digit templates at stat-counter size (h~17) */
	statDigits: GlyphSet | null;
	/**
	 * digit templates for team totals (h~33, outlined, on team-color box).
	 * Optional: falls back to scaled paint digits, at reduced accuracy.
	 */
	teamDigits: GlyphSet | null;
	nameGlyphs: GlyphSet | null;
	/** header tag glyphs: lobby line, and the mode+stage line */
	headerLobbyGlyphs: GlyphSet | null;
	headerLineGlyphs: GlyphSet | null;
	/**
	 * Replay-browser extras (FOT-RowdyStd face, unlike everything above):
	 * the replay code line, and the VICTORY/DEFEAT panel tags. Optional:
	 * the replay detector falls back to rescaled name/header glyphs, at
	 * reduced accuracy.
	 */
	replayCodeGlyphs?: GlyphSet | null;
	replayResultGlyphs?: GlyphSet | null;
	/**
	 * Death-screen extras. Optional: the death detector skips the fields it
	 * has no resources for. The weapon atlas carries both Blitz faces; the
	 * tag-name atlas is BlitzBold + Rowdy (kana).
	 */
	abilities?: import("../death/abilities").AbilityTemplates | null;
	deathWeaponGlyphs?: GlyphSet | null;
	/**
	 * JA death-message glyphs (Kurokane/Rowdy condensed + fixture crops),
	 * built at the on-screen text's native size. Optional: without them JA
	 * death screens fail the constant-line confirmation and emit nothing.
	 */
	deathWeaponJaGlyphs?: GlyphSet | null;
	deathTagNameGlyphs?: GlyphSet | null;
	/**
	 * The main-weapon icons again, rebuilt at the death burst's icon size
	 * (~124px vs the rows' 40-64px). Optional: without them the death
	 * detector cannot recover the killer's weapon when the message text is
	 * unreadable (e.g. the WIPEOUT banner covering the weapon name line).
	 */
	deathBurstWeapons?: WeaponTemplate[] | null;
	/**
	 * Personal-results extras: the same ability icons rebuilt at the gear
	 * cards' badge sizes (scoreboard-own/abilities.ts). Optional: without
	 * them the scoreboard-own detector skips the ability grid.
	 */
	ownAbilities?: import("../death/abilities").AbilityTemplates | null;
	/**
	 * Map-start intro extras: the big BlitzBold mode title, and the BlitzMain
	 * stage name (whose atlas also reads the "MODE" label, rescaled).
	 * Optional: without them the map-start detector emits nothing.
	 */
	mapStartModeGlyphs?: GlyphSet | null;
	mapStartStageGlyphs?: GlyphSet | null;
	/**
	 * Minimap extras (minimap/rois.ts documents the screen): the main-weapon
	 * icons composited on the card-pill background for the teammate cards'
	 * light silhouettes, a light-background variant for highlighted enemy
	 * rows, and the ability icons at the cards' badge size. Optional: without
	 * them the minimap detector skips the corresponding fields (enemy rows
	 * fall back to the standard `weapons` set). Names reuse `nameGlyphs`.
	 */
	minimapCardWeapons?: WeaponTemplate[] | null;
	minimapLightWeapons?: WeaponTemplate[] | null;
	minimapAbilities?: WeaponTemplate[] | null;
	/**
	 * Sub-weapon silhouettes (assets/cv/sub-weapons) at the minimap sub
	 * tile's sizes. Optional: without them, near-tied minimap weapon icons
	 * whose kits differ only by sub (plain vs Custom Dualie Squelchers) stay
	 * decided by icon score alone.
	 */
	minimapSubWeapons?: SpecialTemplate[] | null;
	/**
	 * Planner-map structural signatures (assets/cv/planner) used by the
	 * minimap detector to identify the stage. Optional: without them the
	 * minimap event's `stage` stays null.
	 */
	plannerStages?: import("../minimap/stage").PlannerStage[] | null;
}

export const SCOREBOARD_EVENT_TYPE = "Scoreboard";

export function createScoreboardDetector(
	resources: ScoreboardResources,
): Detector<ScoreboardData> {
	const cv = getCV();
	const teamDigits =
		resources.teamDigits ??
		(resources.paintDigits
			? scaleGlyphSet(
					resources.paintDigits,
					TEAM_DIGIT_HEIGHT / PAINT_DIGIT_HEIGHT,
				)
			: null);
	const matchScoreSets = teamDigits
		? MATCH_SCORE_DIGIT_HEIGHTS.map((height) =>
				scaleGlyphSet(teamDigits, height / teamDigits.height),
			)
		: [];

	function gate(frame: Mat): GateResult {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);

		let darkOk = 0;
		let suffixOk = 0;
		for (const cy of ROW_CENTERS) {
			if (meanBrightness(frame, gateDarkProbe(cy)) < GATE_DARK_MAX_MEAN)
				darkOk++;
			if (maxBrightness(gray, paintSuffixRoi(cy)) > GATE_TEXT_MIN_MAX)
				suffixOk++;
		}
		let panelOk = 0;
		for (const roi of GATE_PANEL_PROBES) {
			if (meanBrightness(frame, roi) < GATE_PANEL_MAX_MEAN) panelOk++;
		}
		gray.delete();

		const score =
			(darkOk / ROW_CENTERS.length +
				suffixOk / ROW_CENTERS.length +
				panelOk / GATE_PANEL_PROBES.length) /
			3;
		const pass = darkOk >= 7 && suffixOk >= 6 && panelOk >= 2;
		return { pass, score };
	}

	function parse(frame: Mat, t: number): DetectedEvent<ScoreboardData>[] {
		const gray = new cv.Mat();
		cv.cvtColor(frame, gray, cv.COLOR_RGBA2GRAY);
		const rgb = new cv.Mat();
		cv.cvtColor(frame, rgb, cv.COLOR_RGBA2RGB);

		const players: ScoreboardPlayer[] = [];
		const rowDebug: ScoreboardRowDebug[] = [];
		const confidences: number[] = [];

		const rowRois: RowRois = {
			weapon: weaponRoi,
			specialIcon: specialIconRoi,
			paint: paintRoi,
			name: nameRoi,
			stat: statRoi,
			povArrow: povArrowRoi,
		};
		for (const cy of ROW_CENTERS) {
			const row = parseScoreboardRow(
				gray,
				rgb,
				cy,
				rowRois,
				resources,
				confidences,
			);
			players.push(row.player);
			rowDebug.push(row.debug);
		}
		const povIndex = findPovIndex(rowDebug.map((r) => r.povFraction));

		let header: ParsedHeader | null = null;
		if (resources.headerLobbyGlyphs && resources.headerLineGlyphs) {
			header = parseHeader(
				gray,
				resources.headerLobbyGlyphs,
				resources.headerLineGlyphs,
			);
			confidences.push(header.confidence);
		}

		// The winner's team total is read only to recognize a knockout: the
		// box prints the count times five, and only a knockout's full 100
		// count reaches 500 (the banner value it would confirm is hidden
		// under the KNOCKOUT! burst).
		let knockout = false;
		let winnerTotalConf = 0;
		if (teamDigits) {
			// The total sits on the team-colored box (light swirl pattern),
			// so binarize more aggressively than on the black pills.
			const crop = cropRoi(gray, TEAM_SCORE_ROIS[0]);
			const winnerTotal = parseNumber(crop, teamDigits, {
				binThreshold: 175,
			});
			crop.delete();
			knockout = winnerTotal.value === FULL_COUNT_TEAM_SCORE;
			winnerTotalConf = winnerTotal.confidence;
		}

		let matchScores: [number | null, number | null] = [null, null];
		let bannerDebug: object | undefined;
		if (matchScoreSets.length > 0) {
			const left = parseBannerScore(gray, MATCH_SCORE_ROIS[0], matchScoreSets);
			const right = parseBannerScore(gray, MATCH_SCORE_ROIS[1], matchScoreSets);
			matchScores = resolveMatchScores({ left, right, knockout });
			confidences.push(left.confidence, right.confidence);
			bannerDebug = { left, right, knockout, winnerTotalConf };
		}

		gray.delete();
		rgb.delete();

		const confidence =
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0;

		return [
			{
				type: SCOREBOARD_EVENT_TYPE,
				t,
				confidence,
				data: {
					lobby: header?.lobby ?? null,
					mode: header?.mode ?? null,
					stage: header?.stage ?? null,
					matchScores,
					players,
					povIndex,
				},
				debug: {
					rows: rowDebug,
					matchScore: bannerDebug,
					header: header?.debug,
				},
			},
		];
	}

	// just under the measured clean-read floor (fixtures 0.865-0.899,
	// confirmed scan events down to 0.799)
	return {
		id: "scoreboard",
		sufficientConfidence: 0.79,
		gate,
		parse,
	};
}
