import * as R from "remeda";
import type { Tables, TournamentStageSettings } from "~/db/tables";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import invariant from "../../../utils/invariant";

export interface DBSource {
	/** Index of the bracket where the teams come from */
	bracketIdx: number;
	/** Team placements that join this bracket. E.g. [1, 2] would mean top 1 & 2 teams. [-1] would mean the last placing teams. Can be empty array for Swiss brackets with early advance. */
	placements: number[];
	/** When true, the highest value in `placements` is treated as "and every placement after that". Set by the "N+" rest syntax. Only valid with positive placements. */
	rest?: boolean;
}

export interface EditableSource {
	/** Bracket ID that exists in frontend only while editing. Once the sources are set an index is used to identifyer them instead. See DBSource.bracketIdx for more info. */
	bracketId: string;
	/** User editable string of placements. For example might be "1-3" or "1,2,3" which both mean same thing. See DBSource.placements for the validated and serialized version. */
	placements: string;
}

interface BracketBase {
	type: Tables["TournamentStage"]["type"];
	settings: TournamentStageSettings;
	name: string;
	requiresCheckIn: boolean;
}

// Note sources is array for future proofing reasons. Currently the array is always of length 1 if it exists.

export interface InputBracket extends BracketBase {
	id: string;
	sources?: EditableSource[];
	startTime?: Date;
	/** This bracket cannot be edited (because it is already underway) */
	disabled?: boolean;
}

export interface ParsedBracket extends BracketBase {
	sources?: DBSource[];
	startTime?: number;
}

export type ValidationError =
	// user written placements can not be parsed
	| {
			type: "PLACEMENTS_PARSE_ERROR";
			bracketIdx: number;
	  }
	// tournament is ending with a format that does not resolve a winner such as round robin or grouped swiss
	| {
			type: "NOT_RESOLVING_WINNER";
	  }
	// from each bracket one placement can lead to only one bracket
	| {
			type: "SAME_PLACEMENT_TO_MULTIPLE_BRACKETS";
			bracketIdxs: number[];
	  }
	// from one bracket e.g. if 1st goes somewhere and 3rd goes somewhere then 2nd must also go somewhere
	| {
			type: "GAP_IN_PLACEMENTS";
			bracketIdxs: number[];
	  }
	// if round robin groups size is 4 then it doesn't make sense to have destination for 5
	| {
			type: "TOO_MANY_PLACEMENTS";
			bracketIdx: number;
	  }
	// placements above the hard cap are nonsensical and bloat the settings JSON
	| {
			type: "PLACEMENT_TOO_HIGH";
			bracketIdx: number;
	  }
	// two brackets can not have the same name
	| {
			type: "DUPLICATE_BRACKET_NAME";
			bracketIdxs: number[];
	  }
	// all brackets must have a name that is not an empty string
	| {
			type: "NAME_MISSING";
			bracketIdx: number;
	  }
	// negative progression (e.g. losers of first round go somewhere) is only for elimination bracket
	| {
			type: "NEGATIVE_PROGRESSION";
			bracketIdx: number;
	  }
	// single elimination is not a valid source bracket (might change in the future)
	| {
			type: "NO_SE_SOURCE";
			bracketIdx: number;
	  }
	// no DE positive placements (might change in the future)
	| {
			type: "NO_DE_POSITIVE";
			bracketIdx: number;
	  }
	// Swiss bracket with early advance/elimination must have a destination bracket
	| {
			type: "SWISS_EARLY_ADVANCE_NO_DESTINATION";
			bracketIdx: number;
	  }
	// A/B divisions setting is only valid on round robin brackets
	| {
			type: "AB_DIVISIONS_NOT_ROUND_ROBIN";
			bracketIdx: number;
	  }
	// A/B divisions setting is only valid on starting brackets (no sources)
	| {
			type: "AB_DIVISIONS_NOT_STARTING";
			bracketIdx: number;
	  }
	// A/B divisions requires an even teamsPerGroup so each group can be split equally
	| {
			type: "AB_DIVISIONS_ODD_TEAMS_PER_GROUP";
			bracketIdx: number;
	  }
	// empty placements is only valid when sourcing from a Swiss bracket with early advance
	| {
			type: "EMPTY_PLACEMENTS_ON_NON_SWISS";
			bracketIdx: number;
	  };

/** Takes validated brackets and returns them in the format that is ready for user input. */
export function validatedBracketsToInputFormat(
	brackets: ParsedBracket[],
): InputBracket[] {
	return brackets.map((bracket, bracketIdx) => {
		return {
			id: String(bracketIdx),
			name: bracket.name,
			settings: bracket.settings ?? {},
			type: bracket.type,
			requiresCheckIn: bracket.requiresCheckIn ?? false,
			startTime: bracket.startTime
				? databaseTimestampToDate(bracket.startTime)
				: undefined,
			sources: bracket.sources?.map((source) => ({
				bracketId: String(source.bracketIdx),
				placements:
					source.placements.length > 0
						? placementsToString(source.placements, source.rest)
						: "",
			})),
		};
	});
}

function placementsToString(placements: number[], rest = false): string {
	if (placements.length === 0) return "";

	placements.sort((a, b) => a - b);

	if (placements.some((p) => p < 0)) {
		placements.sort((a, b) => b - a);
		return placements.join(",");
	}

	const highest = placements[placements.length - 1];
	const allButHighest = rest ? placements.slice(0, -1) : placements;

	const ranges: string[] = [];

	if (allButHighest.length > 0) {
		let start = allButHighest[0];
		let end = allButHighest[0];

		for (let i = 1; i < allButHighest.length; i++) {
			if (allButHighest[i] === end + 1) {
				end = allButHighest[i];
			} else {
				ranges.push(start === end ? `${start}` : `${start}-${end}`);
				start = allButHighest[i];
				end = allButHighest[i];
			}
		}

		ranges.push(start === end ? `${start}` : `${start}-${end}`);
	}

	if (rest) {
		ranges.push(`${highest}+`);
	}

	return ranges.join(",");
}

/** Takes bracket progression as entered by user as input and returns the validated brackets ready for input to the database or errors if any. */
export function validatedBrackets(
	brackets: InputBracket[],
): ParsedBracket[] | ValidationError {
	let parsed: ParsedBracket[];
	try {
		parsed = toOutputBracketFormat(brackets);
	} catch (e) {
		if ((e as { badBracketIdx: number }).badBracketIdx) {
			return {
				type: "PLACEMENTS_PARSE_ERROR",
				bracketIdx: (e as { badBracketIdx: number }).badBracketIdx,
			};
		}

		throw e;
	}

	const validationError = bracketsToValidationError(parsed);

	if (validationError) {
		return validationError;
	}

	return parsed;
}

/** Checks parsed brackets for any errors related to how the progression is laid out  */
export function bracketsToValidationError(
	brackets: ParsedBracket[],
): ValidationError | null {
	if (!resolvesWinner(brackets)) {
		return {
			type: "NOT_RESOLVING_WINNER",
		};
	}

	let faultyBracketIdxs: number[] | null = null;

	faultyBracketIdxs = samePlacementToMultipleBrackets(brackets);
	if (faultyBracketIdxs) {
		return {
			type: "SAME_PLACEMENT_TO_MULTIPLE_BRACKETS",
			bracketIdxs: faultyBracketIdxs,
		};
	}

	faultyBracketIdxs = duplicateNames(brackets);
	if (faultyBracketIdxs) {
		return {
			type: "DUPLICATE_BRACKET_NAME",
			bracketIdxs: faultyBracketIdxs,
		};
	}

	faultyBracketIdxs = gapInPlacements(brackets);
	if (faultyBracketIdxs) {
		return {
			type: "GAP_IN_PLACEMENTS",
			bracketIdxs: faultyBracketIdxs,
		};
	}

	let faultyBracketIdx: number | null = null;

	faultyBracketIdx = tooManyPlacements(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "TOO_MANY_PLACEMENTS",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = placementTooHigh(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "PLACEMENT_TOO_HIGH",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = nameMissing(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "NAME_MISSING",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = negativeProgression(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "NEGATIVE_PROGRESSION",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = noSingleEliminationAsSource(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "NO_SE_SOURCE",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = noDoubleEliminationPositive(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "NO_DE_POSITIVE",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = swissEarlyAdvanceWithoutDestination(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "SWISS_EARLY_ADVANCE_NO_DESTINATION",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = emptyPlacementsOnNonSwiss(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "EMPTY_PLACEMENTS_ON_NON_SWISS",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = abDivisionsOnNonRoundRobin(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "AB_DIVISIONS_NOT_ROUND_ROBIN",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = abDivisionsOnNonStartingBracket(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "AB_DIVISIONS_NOT_STARTING",
			bracketIdx: faultyBracketIdx,
		};
	}

	faultyBracketIdx = abDivisionsOddTeamsPerGroup(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "AB_DIVISIONS_ODD_TEAMS_PER_GROUP",
			bracketIdx: faultyBracketIdx,
		};
	}

	return null;
}

function toOutputBracketFormat(brackets: InputBracket[]): ParsedBracket[] {
	const result = brackets.map((bracket, bracketIdx) => {
		return {
			type: bracket.type,
			settings: bracket.settings,
			name: bracket.name,
			requiresCheckIn: bracket.requiresCheckIn,
			startTime: bracket.startTime
				? dateToDatabaseTimestamp(bracket.startTime)
				: undefined,
			sources: bracket.sources?.map((source) => {
				const parsed = parsePlacements(source.placements);
				const sourceBracketIdx = brackets.findIndex(
					(b) => b.id === source.bracketId,
				);
				const sourceBracket = brackets[sourceBracketIdx];

				// Allow empty placements only for Swiss brackets with early advance
				if (parsed && parsed.placements.length === 0) {
					const isSwissWithEarlyAdvance =
						sourceBracket?.type === "swiss" &&
						sourceBracket?.settings?.advanceThreshold;
					if (!isSwissWithEarlyAdvance) {
						throw { badBracketIdx: bracketIdx };
					}
				} else if (parsed === null) {
					throw { badBracketIdx: bracketIdx };
				}

				return {
					bracketIdx: sourceBracketIdx,
					placements: parsed?.placements ?? [],
					...(parsed?.rest ? { rest: true as const } : {}),
				};
			}),
		};
	});

	invariant(
		result.every(
			(bracket) =>
				!bracket.sources ||
				bracket.sources.every((source) => source.bracketIdx >= 0),
			"Bracket source not found",
		),
	);

	return result;
}

function parsePlacements(
	placements: string,
): { placements: number[]; rest: boolean } | null {
	if (placements.trim() === "") {
		return { placements: [], rest: false };
	}

	const parts = placements.split(",").map((p) => p.trim());

	const result: number[] = [];
	let rest = false;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		const isLast = i === parts.length - 1;

		const isNegative = part.match(/^-\d+$/);
		if (isNegative) {
			result.push(Number(part));
			continue;
		}

		const restMatch = part.match(/^(\d+)(?:-(\d+))?\+$/);
		if (restMatch) {
			if (!isLast || part === "0+") return null;
			rest = true;

			const start = Number(restMatch[1]);
			const end = restMatch[2] ? Number(restMatch[2]) : start;
			if (end < start) return null;
			for (let n = start; n <= end; n++) {
				result.push(n);
			}
			continue;
		}

		const isValid = part.match(/^\d+(-\d+)?$/) && part !== "0";
		if (!isValid) return null;

		if (part.includes("-")) {
			const [start, end] = part.split("-").map(Number);

			for (let n = start; n <= end; n++) {
				result.push(n);
			}
		} else {
			result.push(Number(part));
		}
	}

	return { placements: result, rest };
}

function resolvesWinner(brackets: ParsedBracket[]) {
	const finals = brackets.find((_, idx) => isFinals(idx, brackets));

	if (!finals) return false;
	if (
		finals.type === "swiss" &&
		(finals.settings.groupCount ?? TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT) > 1
	) {
		return false;
	}

	return true;
}

function samePlacementToMultipleBrackets(brackets: ParsedBracket[]) {
	const map = new Map<string, number[]>();
	// per source bracketIdx: list of { destinationBracketIdx, restFromPlacement }
	const restSources = new Map<
		number,
		{ destinationBracketIdx: number; restFromPlacement: number }[]
	>();

	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (!bracket.sources) continue;

		for (const source of bracket.sources) {
			for (const placement of source.placements) {
				const id = `${source.bracketIdx}-${placement}`;

				if (!map.has(id)) {
					map.set(id, []);
				}

				map.get(id)!.push(bracketIdx);
			}

			if (source.rest && source.placements.length > 0) {
				const positives = source.placements.filter((p) => p > 0);
				if (positives.length === 0) continue;
				const restFromPlacement = Math.max(...positives);

				if (!restSources.has(source.bracketIdx)) {
					restSources.set(source.bracketIdx, []);
				}
				restSources.get(source.bracketIdx)!.push({
					destinationBracketIdx: bracketIdx,
					restFromPlacement,
				});
			}
		}
	}

	const result = new Set<number>();

	for (const [_, bracketIdxs] of map) {
		if (bracketIdxs.length > 1) {
			for (const idx of bracketIdxs) result.add(idx);
		}
	}

	for (const [sourceBracketIdx, restList] of restSources) {
		// multiple "rest" sources from same bracket = conflict
		if (restList.length > 1) {
			for (const { destinationBracketIdx } of restList) {
				result.add(destinationBracketIdx);
			}
		}

		// any other source that claims a placement >= restFromPlacement = conflict
		const restEntry = restList[0];
		if (!restEntry) continue;
		for (const [otherBracketIdx, otherBracket] of brackets.entries()) {
			if (!otherBracket.sources) continue;
			for (const otherSource of otherBracket.sources) {
				if (otherSource.bracketIdx !== sourceBracketIdx) continue;
				if (otherBracketIdx === restEntry.destinationBracketIdx) continue;
				if (
					otherSource.placements.some(
						(p) => p > 0 && p >= restEntry.restFromPlacement,
					)
				) {
					result.add(otherBracketIdx);
					result.add(restEntry.destinationBracketIdx);
				}
			}
		}
	}

	return result.size > 0 ? [...result] : null;
}

function duplicateNames(brackets: ParsedBracket[]) {
	const names = new Set<string>();

	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (names.has(bracket.name)) {
			return [brackets.findIndex((b) => b.name === bracket.name), bracketIdx];
		}

		names.add(bracket.name);
	}

	return null;
}

function gapInPlacements(brackets: ParsedBracket[]) {
	const placementsMap = new Map<number, number[]>();

	for (const bracket of brackets) {
		if (!bracket.sources) continue;

		for (const source of bracket.sources) {
			if (!placementsMap.has(source.bracketIdx)) {
				placementsMap.set(source.bracketIdx, []);
			}

			placementsMap.get(source.bracketIdx)!.push(...source.placements);
		}
	}

	let problematicBracketIdx: number | null = null;
	for (const [sourceBracketIdx, placements] of placementsMap.entries()) {
		if (problematicBracketIdx !== null) break;

		const placementsToConsider = placements
			.filter((placement) => placement > 0)
			.sort((a, b) => a - b);

		for (let i = 0; i < placementsToConsider.length - 1; i++) {
			if (placementsToConsider[i] + 1 !== placementsToConsider[i + 1]) {
				problematicBracketIdx = sourceBracketIdx;
				break;
			}
		}
	}

	if (problematicBracketIdx === null) return null;

	return brackets.flatMap((bracket, bracketIdx) => {
		if (!bracket.sources) return [];

		return bracket.sources.flatMap(
			(source) => source.bracketIdx === problematicBracketIdx,
		)
			? [bracketIdx]
			: [];
	});
}

function tooManyPlacements(brackets: ParsedBracket[]) {
	const roundRobins = brackets.flatMap((bracket, bracketIdx) =>
		bracket.type === "round_robin" ? [bracketIdx] : [],
	);

	for (const [bracketIdx, bracket] of brackets.entries()) {
		for (const source of bracket.sources ?? []) {
			if (!roundRobins.includes(source.bracketIdx)) continue;

			const sourceSettings = brackets[source.bracketIdx].settings;
			const teamsPerGroup =
				sourceSettings.teamsPerGroup ??
				TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP;
			const size = sourceSettings.hasAbDivisions
				? teamsPerGroup / 2
				: teamsPerGroup;

			if (source.placements.some((placement) => placement > size)) {
				return bracketIdx;
			}
		}
	}

	return null;
}

function placementTooHigh(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		for (const source of bracket.sources ?? []) {
			if (
				source.placements.some(
					(placement) => placement > TOURNAMENT.PLACEMENT_MAX,
				)
			) {
				return bracketIdx;
			}
		}
	}

	return null;
}

function nameMissing(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (!bracket.name) {
			return bracketIdx;
		}
	}

	return null;
}

function negativeProgression(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		for (const source of bracket.sources ?? []) {
			const sourceBracket = brackets[source.bracketIdx];
			if (
				sourceBracket.type === "double_elimination" ||
				sourceBracket.type === "single_elimination"
			) {
				continue;
			}

			if (source.placements.some((placement) => placement < 0)) {
				return bracketIdx;
			}
		}
	}

	return null;
}

function noSingleEliminationAsSource(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		for (const source of bracket.sources ?? []) {
			const sourceBracket = brackets[source.bracketIdx];
			if (sourceBracket.type === "single_elimination") {
				return bracketIdx;
			}
		}
	}

	return null;
}

function noDoubleEliminationPositive(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		for (const source of bracket.sources ?? []) {
			const sourceBracket = brackets[source.bracketIdx];
			if (
				sourceBracket.type === "double_elimination" &&
				source.placements.some((placement) => placement > 0)
			) {
				return bracketIdx;
			}
		}
	}

	return null;
}

function abDivisionsOnNonRoundRobin(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (bracket.settings.hasAbDivisions && bracket.type !== "round_robin") {
			return bracketIdx;
		}
	}

	return null;
}

function abDivisionsOnNonStartingBracket(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (
			bracket.settings.hasAbDivisions &&
			bracket.sources &&
			bracket.sources.length > 0
		) {
			return bracketIdx;
		}
	}

	return null;
}

function abDivisionsOddTeamsPerGroup(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (!bracket.settings.hasAbDivisions) continue;

		const teamsPerGroup =
			bracket.settings.teamsPerGroup ??
			TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP;

		if (teamsPerGroup % 2 !== 0) {
			return bracketIdx;
		}
	}

	return null;
}

function swissEarlyAdvanceWithoutDestination(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (bracket.type === "swiss" && bracket.settings.advanceThreshold) {
			const hasDestination = brackets.some((otherBracket) =>
				otherBracket.sources?.some(
					(source) => source.bracketIdx === bracketIdx,
				),
			);

			if (!hasDestination) {
				return bracketIdx;
			}
		}
	}

	return null;
}

function emptyPlacementsOnNonSwiss(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		for (const source of bracket.sources ?? []) {
			if (source.placements.length > 0) continue;

			const sourceBracket = brackets[source.bracketIdx];
			const isSwissEarlyAdvance =
				sourceBracket?.type === "swiss" &&
				sourceBracket.settings.advanceThreshold;

			if (!isSwissEarlyAdvance) {
				return bracketIdx;
			}
		}
	}

	return null;
}

/** Takes the return type of `Progression.validatedBrackets` as an input and narrows the type to a successful validation */
export function isBrackets(
	input: ParsedBracket[] | ValidationError,
): input is ParsedBracket[] {
	return Array.isArray(input);
}

/** Takes the return type of `Progression.validatedBrackets` as an input and narrows the type to a unsuccessful validation */
export function isError(
	input: ParsedBracket[] | ValidationError,
): input is ValidationError {
	return !Array.isArray(input);
}

/** Given bracketIdx and bracketProgression will resolve if this the "final stage" of the tournament that decides the final standings  */
export function isFinals(idx: number, brackets: ParsedBracket[]) {
	invariant(idx < brackets.length, "Bracket index out of bounds");

	return resolveMainBracketProgression(brackets).at(-1) === idx;
}

/** Returns true if the finals bracket of the tournament is an A/B divisions round robin. */
export function hasAbDivisionsFinals(brackets: ParsedBracket[]): boolean {
	const finals = brackets.find((_, idx) => isFinals(idx, brackets));
	if (!finals) return false;

	return (
		finals.type === "round_robin" && finals.settings?.hasAbDivisions === true
	);
}

/** Given bracketIdx and bracketProgression will resolve if this an "underground bracket".
 * Underground bracket is defined as a bracket that is not part of the main tournament progression e.g. optional bracket for early losers
 */
export function isUnderground(idx: number, brackets: ParsedBracket[]) {
	invariant(idx < brackets.length, "Bracket index out of bounds");

	const startBrackets = startingBrackets(brackets);

	for (const startBracketIdx of startBrackets) {
		if (
			resolveMainBracketProgression(brackets, startBracketIdx).includes(idx)
		) {
			return false;
		}
	}

	return true;
}

/**
 * Returns the depth of a bracket in the tournament progression.
 * Depth is the distance from a starting bracket (bracket with no sources).
 * Starting brackets have depth 0, brackets sourced from them have depth 1, etc.
 */
export function bracketDepth(idx: number, brackets: ParsedBracket[]): number {
	invariant(idx < brackets.length, "Bracket index out of bounds");

	const bracket = brackets[idx];

	if (!bracket.sources || bracket.sources.length === 0) {
		return 0;
	}

	const sourceDepths = bracket.sources.map((source) =>
		bracketDepth(source.bracketIdx, brackets),
	);

	return Math.max(...sourceDepths) + 1;
}

function resolveMainBracketProgression(
	brackets: ParsedBracket[],
	startBracketIdx = 0,
) {
	if (brackets.length === 1) return [0];

	let bracketIdxToFind = startBracketIdx;
	const result = [startBracketIdx];
	while (true) {
		const bracket = brackets.findIndex((bracket) =>
			bracket.sources?.some(
				(source) =>
					// empty array is the swiss early advance case
					(source.placements.includes(1) || source.placements.length === 0) &&
					source.bracketIdx === bracketIdxToFind,
			),
		);

		if (bracket === -1) break;

		bracketIdxToFind = bracket;
		result.push(bracketIdxToFind);
	}

	return result;
}

/** Considering all fields. Returns array of bracket indexes that were changed */
export function changedBracketProgression(
	oldProgression: ParsedBracket[],
	newProgression: ParsedBracket[],
) {
	const changed: number[] = [];

	for (let i = 0; i < oldProgression.length; i++) {
		const oldBracket = oldProgression[i];
		const newBracket = newProgression.at(i);

		if (!newBracket || !R.isDeepEqual(oldBracket, newBracket)) {
			changed.push(i);
		}
	}

	return changed;
}

/** Considering only fields that affect the format. Returns true if the tournament bracket format was changed and false otherwise */
export function changedBracketProgressionFormat(
	oldProgression: ParsedBracket[],
	newProgression: ParsedBracket[],
): boolean {
	for (let i = 0; i < oldProgression.length; i++) {
		const oldBracket = oldProgression[i];
		const newBracket = newProgression.at(i);

		// sources, startTime or requiresCheckIn are not considered
		if (
			!newBracket ||
			newBracket.name !== oldBracket.name ||
			newBracket.type !== oldBracket.type ||
			!R.isDeepEqual(newBracket.settings, oldBracket.settings)
		) {
			return true;
		}
	}

	return false;
}

/**
 * Returns the order of brackets as is to be considered for standings. Teams from the bracket of lower index are considered to be above those from the lower bracket.
 * A participant's standing is the first bracket to appear in order that has the participant in it.
 *
 * The order is so that most significant brackets (i.e. finals) appear first.
 */
export function bracketIdxsForStandings(progression: ParsedBracket[]) {
	const bracketsToConsider = bracketsReachableFrom(0, progression);

	const withoutIntermediateBrackets = bracketsToConsider.filter(
		(bracket, bracketIdx) => {
			if (bracketIdx === 0) return true;

			return progression.every(
				(b) => !b.sources?.some((s) => s.bracketIdx === bracket),
			);
		},
	);

	const withoutUnderground = withoutIntermediateBrackets.filter(
		(bracketIdx) => {
			const sources = progression[bracketIdx].sources;

			if (!sources) return true;

			return !sources.some(
				(source) =>
					progression[source.bracketIdx].type === "double_elimination",
			);
		},
	);

	const minSourcedPlacements = new Map(
		withoutUnderground.map((idx) => [
			idx,
			minSourcedPlacement(progression, idx),
		]),
	);

	return [...withoutUnderground].sort((a, b) => {
		const minA = minSourcedPlacements.get(a)!;
		const minB = minSourcedPlacements.get(b)!;

		if (minA === minB) {
			return a - b;
		}

		return minA - minB;
	});
}

function minSourcedPlacement(
	progression: ParsedBracket[],
	bracketIdx: number,
): number {
	const sources = progression[bracketIdx].sources;
	if (!sources || sources.length === 0) return Number.POSITIVE_INFINITY;

	let min = Number.POSITIVE_INFINITY;
	for (const source of sources) {
		for (const placement of source.placements) {
			if (placement < min) min = placement;
		}
	}
	return min;
}

export function bracketsReachableFrom(
	bracketIdx: number,
	progression: ParsedBracket[],
	visited: Set<number> = new Set(),
): number[] {
	if (visited.has(bracketIdx)) return [];
	visited.add(bracketIdx);

	const result = [bracketIdx];

	for (const [newBracketIdx, bracket] of progression.entries()) {
		if (!bracket.sources) continue;

		for (const source of bracket.sources) {
			if (source.bracketIdx === bracketIdx) {
				result.push(
					...bracketsReachableFrom(newBracketIdx, progression, visited),
				);
			}
		}
	}

	return result;
}

export function destinationsFromBracketIdx(
	sourceBracketIdx: number,
	progression: ParsedBracket[],
): number[] {
	const destinations: number[] = [];

	for (const [destinationBracketIdx, bracket] of progression.entries()) {
		if (!bracket.sources) continue;

		for (const source of bracket.sources) {
			if (source.bracketIdx === sourceBracketIdx) {
				destinations.push(destinationBracketIdx);
			}
		}
	}

	return destinations;
}

export function destinationByPlacement({
	sourceBracketIdx,
	placement,
	progression,
}: {
	sourceBracketIdx: number;
	placement: number;
	progression: ParsedBracket[];
}): number | null {
	const destinations = destinationsFromBracketIdx(
		sourceBracketIdx,
		progression,
	);

	const destination = destinations.find((destinationBracketIdx) =>
		progression[destinationBracketIdx].sources?.some(
			(source) =>
				source.bracketIdx === sourceBracketIdx &&
				sourceClaimsPlacement(source, placement),
		),
	);

	return destination ?? null;
}

function sourceClaimsPlacement(source: DBSource, placement: number): boolean {
	if (source.placements.includes(placement)) return true;
	if (source.rest && source.placements.length > 0 && placement > 0) {
		return placement >= Math.max(...source.placements);
	}
	return false;
}

export function startingBrackets(progression: ParsedBracket[]): number[] {
	return progression
		.map((bracket, idx) => ({ bracket, idx }))
		.filter(({ bracket }) => !bracket.sources)
		.map(({ idx }) => idx);
}
