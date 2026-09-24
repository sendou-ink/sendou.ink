/**
 * ScoreboardOwnDetector: parses the personal results screen — header tags
 * (shared with the live scoreboard), the main weapon from the weapon card's
 * title (OCR'd with the death-weapon atlas, the only one with that charset,
 * snapped against every language's names) and own gear abilities from the
 * three gear cards' badge strips.
 */

import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import {
	type ScannerLobby,
	toAbilityWithUnknown,
	toMainWeaponId,
} from "../../../scanner-types";
import type { Mat } from "../../cv";
import { type GlyphSet, recognizeTextSteps, scaleGlyphSet } from "../../glyphs";
import {
	copyRoi,
	cropRoi,
	frameGray,
	frameRgb,
	maxBrightness,
	meanBrightness,
} from "../../image";
import { all, done, type MatchSteps, runSync } from "../../match-steps";
import { closestBy, matchKey } from "../../text";
import { LOCALIZED_WEAPON_NAMES } from "../death/localized-messages";
import { ALL_WEAPON_ENTRIES, type WeaponEntry } from "../death/weapon-names";
import { parseHeaderSteps } from "../scoreboard/header";
import type { ScoreboardResources } from "../scoreboard/index";
import { matchWeaponSteps, type WeaponMatch } from "../scoreboard/weapons";
import type { DetectedEvent, Detector, GateResult } from "../types";
import {
	GATE_PANEL_MAX_MEAN,
	GATE_PANEL_PROBES,
	GATE_STRIP_MAX_MEAN,
	GATE_STRIP_MIN_MEAN,
	GATE_TEXT_MIN_MAX,
	GATE_TITLE_TEXT_PROBES,
	GEAR_ROWS,
	gateStripProbe,
	gearMainRoi,
	gearSubRoi,
	OWN_ABILITY_INK_THRESHOLD,
	WEAPON_TITLE_BAND,
	WEAPON_TITLE_BIN_THRESHOLD,
	WEAPON_TITLE_TEXT_HEIGHT,
} from "./rois";

export interface ScoreboardOwnData {
	/** from the header tag; null when unreadable */
	lobby: ScannerLobby | null;
	mode: ModeShort | null;
	stage: StageId | null;
	/** the player's main weapon; null if unreadable */
	weaponId: MainWeaponId | null;
	/** [head, clothes, shoes] rows of [main, sub, sub, sub] */
	abilities: AbilityWithUnknown[][];
}

export const SCOREBOARD_OWN_EVENT_TYPE = "ScoreboardOwn";

/** Snapped weapon reading below this is reported as null (kept in debug). */
const WEAPON_MIN_SCORE = 0.55;

interface WeaponCandidate {
	text: string;
	entry: WeaponEntry;
}

/** Every string the title can show: all localized main-weapon names plus canonical English. */
let weaponCandidates: WeaponCandidate[] | null = null;
function mainWeaponCandidates(): WeaponCandidate[] {
	if (weaponCandidates) return weaponCandidates;
	const mains = ALL_WEAPON_ENTRIES.filter((e) => e.type === "MAIN");
	const byName = new Map(mains.map((e) => [e.name, e]));
	const seen = new Set<string>();
	weaponCandidates = [];
	const push = (text: string, entry: WeaponEntry | undefined) => {
		const k = matchKey(text);
		if (!entry || seen.has(k)) return;
		seen.add(k);
		weaponCandidates!.push({ text, entry });
	};
	for (const entry of mains) push(entry.name, entry);
	for (const names of Object.values(LOCALIZED_WEAPON_NAMES)) {
		for (const { text, name } of names) push(text, byName.get(name));
	}
	return weaponCandidates;
}

export function createScoreboardOwnDetector(
	resources: ScoreboardResources,
): Detector<ScoreboardOwnData> {
	const titleGlyphs: GlyphSet | null = resources.deathWeaponGlyphs
		? scaleGlyphSet(
				resources.deathWeaponGlyphs,
				WEAPON_TITLE_TEXT_HEIGHT / resources.deathWeaponGlyphs.height,
			)
		: null;
	const abilities = resources.ownAbilities ?? null;

	function gate(frame: Mat): GateResult {
		let panelOk = 0;
		for (const roi of GATE_PANEL_PROBES) {
			if (meanBrightness(frame, roi) < GATE_PANEL_MAX_MEAN) panelOk++;
		}

		const gray = frameGray(frame);
		let textOk = 0;
		for (const roi of GATE_TITLE_TEXT_PROBES) {
			if (maxBrightness(gray, roi) > GATE_TEXT_MIN_MAX) textOk++;
		}

		let stripOk = 0;
		for (let row = 0; row < GEAR_ROWS; row++) {
			const mean = meanBrightness(frame, gateStripProbe(row));
			if (mean >= GATE_STRIP_MIN_MEAN && mean <= GATE_STRIP_MAX_MEAN) stripOk++;
		}

		const score =
			(panelOk / GATE_PANEL_PROBES.length +
				textOk / GATE_TITLE_TEXT_PROBES.length +
				stripOk / GEAR_ROWS) /
			3;
		const pass =
			panelOk === GATE_PANEL_PROBES.length &&
			textOk === GATE_TITLE_TEXT_PROBES.length &&
			stripOk === GEAR_ROWS;
		return { pass, score };
	}

	function* parseSteps(
		frame: Mat,
		t: number,
		_gate: GateResult | undefined,
		speculative: boolean,
	): MatchSteps<DetectedEvent<ScoreboardOwnData>[]> {
		const gray = frameGray(frame);
		const rgb = frameRgb(frame);

		const { headerLobbyGlyphs, headerLineGlyphs } = resources;
		// weapon card title, recognized whole and NOT via readTagBand: the tag is
		// fixed-width, and long names render condensed, whose dense antialiased
		// columns fail the tag-column test and truncate the read mid-name
		const band = titleGlyphs ? copyRoi(gray, WEAPON_TITLE_BAND) : null;
		// gear-card ability strips: [head, clothes, shoes] x [main, sub, sub, sub]
		const abilityCrops = abilities
			? Array.from({ length: GEAR_ROWS }, (_, row) => [
					cropRoi(rgb, gearMainRoi(row)),
					...[0, 1, 2].map((slot) => cropRoi(rgb, gearSubRoi(row, slot))),
				])
			: [];
		const [header, title, abilityMatches] = yield* all([
			// header tags sit at the live scoreboard's positions — shared parser
			headerLobbyGlyphs && headerLineGlyphs
				? parseHeaderSteps(
						gray,
						headerLobbyGlyphs,
						headerLineGlyphs,
						speculative,
					)
				: done(null),
			titleGlyphs && band
				? recognizeTextSteps(
						band,
						titleGlyphs,
						{
							binThreshold: WEAPON_TITLE_BIN_THRESHOLD,
							spaceGap: 9,
							minCharScore: 0.3,
						},
						speculative,
					)
				: done(null),
			all(
				abilityCrops.map((crops) =>
					all(
						crops.map((crop, slot) =>
							matchWeaponSteps(
								crop,
								slot === 0 ? abilities!.mains : abilities!.subs,
								{ inkThreshold: OWN_ABILITY_INK_THRESHOLD },
							),
						),
					),
				),
			),
		]);
		band?.delete();
		for (const crop of abilityCrops.flat()) crop.delete();

		const confidences: number[] = [];
		if (header) confidences.push(header.confidence);

		let weapon: string | null = null;
		let weaponId: MainWeaponId | null = null;
		let weaponScore = 0;
		let weaponReading = "";
		if (title) {
			weaponReading = title.text.trim();
			const match = weaponReading
				? closestBy(weaponReading, mainWeaponCandidates(), (c) => c.text)
				: null;
			if (match) {
				weaponScore = match.score;
				if (match.score >= WEAPON_MIN_SCORE) {
					weapon = match.entry.entry.name;
					weaponId = toMainWeaponId(match.entry.entry.id);
				}
			}
			confidences.push(weaponScore);
		}

		const abilityRows: AbilityWithUnknown[][] = [];
		const abilityDebug: (WeaponMatch | null)[][] = [];
		for (const matches of abilityMatches) {
			const ids: AbilityWithUnknown[] = [];
			const debug: (WeaponMatch | null)[] = [];
			for (const match of matches) {
				ids.push(toAbilityWithUnknown(match.id) ?? "UNKNOWN");
				debug.push(match);
				confidences.push(Math.max(0, match.score));
			}
			abilityRows.push(ids);
			abilityDebug.push(debug);
		}

		const confidence =
			confidences.length > 0
				? confidences.reduce((a, b) => a + b, 0) / confidences.length
				: 0;

		return [
			{
				type: SCOREBOARD_OWN_EVENT_TYPE,
				t,
				confidence,
				data: {
					lobby: header?.lobby ?? null,
					mode: header?.mode ?? null,
					stage: header?.stage ?? null,
					weaponId,
					abilities: abilityRows,
				},
				debug: {
					header: header?.debug,
					weaponName: weapon,
					weaponReading,
					weaponScore,
					abilityRows: abilityDebug.map((row) =>
						row.map((m) => m && { top: m.top, score: m.score }),
					),
				},
			},
		];
	}

	// just under the clean-read floor (fixtures 0.562-0.669, scan events
	// 0.612-0.635; the ability-grid scores keep the mean low even on perfect reads)
	return {
		id: "scoreboard-own",
		sufficientConfidence: 0.55,
		gate,
		parse: (frame, t, gateResult) =>
			runSync(parseSteps(frame, t, gateResult, false)),
		parseSteps,
	};
}
