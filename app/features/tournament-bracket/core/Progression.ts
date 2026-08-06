import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type { TournamentStageSettings } from "~/db/tables-json";
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
	// a single source can not take both top finishers and eliminated teams
	| {
			type: "MIXED_POSITIVE_NEGATIVE_PLACEMENTS";
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
	  }
	// one destination bracket can source each bracket only once
	| {
			type: "DUPLICATE_SOURCE_BRACKET";
			bracketIdx: number;
	  }
	// brackets can not source each other in a loop e.g. A sources B and B sources A
	| {
			type: "CYCLIC_PROGRESSION";
			bracketIdxs: number[];
	  }
	// teams that started in different brackets can never meet, so the routes from many starting brackets can not merge
	| {
			type: "MERGED_STARTING_BRACKETS";
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

/** Formats a placements array into the compact user-facing string form, e.g. [1, 2, 3] -> "1-3" and [5, 6] with rest -> "5,6+". */
export function placementsToString(placements: number[], rest = false): string {
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
	// must be checked first, other validations assume the progression is a directed acyclic graph
	const cyclicBracketIdxs = cyclicProgression(brackets);
	if (cyclicBracketIdxs) {
		return {
			type: "CYCLIC_PROGRESSION",
			bracketIdxs: cyclicBracketIdxs,
		};
	}

	const mergedStartingBracketsIdx = mergedStartingBrackets(brackets);
	if (typeof mergedStartingBracketsIdx === "number") {
		return {
			type: "MERGED_STARTING_BRACKETS",
			bracketIdx: mergedStartingBracketsIdx,
		};
	}

	if (!resolvesWinner(brackets)) {
		return {
			type: "NOT_RESOLVING_WINNER",
		};
	}

	const duplicateSourceBracketIdx = duplicateSourceBracket(brackets);
	if (typeof duplicateSourceBracketIdx === "number") {
		return {
			type: "DUPLICATE_SOURCE_BRACKET",
			bracketIdx: duplicateSourceBracketIdx,
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

	faultyBracketIdx = mixedPositiveNegativePlacements(brackets);
	if (typeof faultyBracketIdx === "number") {
		return {
			type: "MIXED_POSITIVE_NEGATIVE_PLACEMENTS",
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
			if (end < start) return null;

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

		return bracket.sources.some(
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

function mixedPositiveNegativePlacements(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		for (const source of bracket.sources ?? []) {
			if (
				source.placements.some((placement) => placement > 0) &&
				source.placements.some((placement) => placement < 0)
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

function duplicateSourceBracket(brackets: ParsedBracket[]) {
	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (!bracket.sources) continue;

		const seen = new Set<number>();
		for (const source of bracket.sources) {
			if (seen.has(source.bracketIdx)) {
				return bracketIdx;
			}
			seen.add(source.bracketIdx);
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

/** Returns the bracket indexes forming a loop of sources or null if the progression has no loops. */
function cyclicProgression(brackets: ParsedBracket[]) {
	const visited = new Set<number>();
	const currentPath: number[] = [];

	const findCycle = (bracketIdx: number): number[] | null => {
		const pathIdx = currentPath.indexOf(bracketIdx);
		if (pathIdx !== -1) return currentPath.slice(pathIdx);
		if (visited.has(bracketIdx)) return null;

		visited.add(bracketIdx);
		currentPath.push(bracketIdx);

		for (const source of brackets[bracketIdx]?.sources ?? []) {
			const cycle = findCycle(source.bracketIdx);
			if (cycle) return cycle;
		}

		currentPath.pop();

		return null;
	};

	for (const bracketIdx of brackets.keys()) {
		const cycle = findCycle(bracketIdx);
		if (cycle) return cycle.sort((a, b) => a - b);
	}

	return null;
}

/** Returns the index of the bracket where routes from many starting brackets merge or null if they never merge. */
function mergedStartingBrackets(brackets: ParsedBracket[]) {
	const cache = new Map<number, Set<number>>();

	const startingAncestors = (bracketIdx: number): Set<number> => {
		const cached = cache.get(bracketIdx);
		if (cached) return cached;

		const sources = brackets[bracketIdx]?.sources;
		const result = new Set<number>();

		if (!sources?.length) {
			result.add(bracketIdx);
		} else {
			for (const source of sources) {
				for (const ancestorIdx of startingAncestors(source.bracketIdx)) {
					result.add(ancestorIdx);
				}
			}
		}

		cache.set(bracketIdx, result);

		return result;
	};

	for (const [bracketIdx, bracket] of brackets.entries()) {
		if (startingAncestors(bracketIdx).size <= 1) continue;

		// the merge already happened earlier in the progression, that bracket is reported instead
		const mergedEarlier = (bracket.sources ?? []).some(
			(source) => startingAncestors(source.bracketIdx).size > 1,
		);
		if (mergedEarlier) continue;

		return bracketIdx;
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

	const mainBracketIdxs = new Set(
		startingBrackets(brackets).flatMap((startBracketIdx) =>
			resolveMainBracketProgression(brackets, startBracketIdx),
		),
	);

	if (mainBracketIdxs.has(idx)) return false;

	// a bracket whose top finishers advance (transitively) into the main progression
	// is a redemption style intermediate bracket, not an underground one
	const queue = [idx];
	const visited = new Set<number>();
	while (queue.length > 0) {
		const currentIdx = queue.shift()!;
		if (visited.has(currentIdx)) continue;
		visited.add(currentIdx);

		for (const [destinationIdx, bracket] of brackets.entries()) {
			const advancesPositively = bracket.sources?.some(
				(source) =>
					source.bracketIdx === currentIdx &&
					(source.placements.length === 0 ||
						source.placements.some((placement) => placement > 0)),
			);
			if (!advancesPositively) continue;

			if (mainBracketIdxs.has(destinationIdx)) return false;
			queue.push(destinationIdx);
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

	return depthFromStartingBracket(idx, brackets, new Set());
}

function depthFromStartingBracket(
	idx: number,
	brackets: ParsedBracket[],
	pathToBracket: Set<number>,
): number {
	// only possible with an invalid progression, see CYCLIC_PROGRESSION
	if (pathToBracket.has(idx)) return 0;

	const bracket = brackets[idx];

	if (!bracket.sources || bracket.sources.length === 0) {
		return 0;
	}

	const sourceDepths = bracket.sources.map((source) =>
		depthFromStartingBracket(
			source.bracketIdx,
			brackets,
			new Set(pathToBracket).add(idx),
		),
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
	const visited = new Set([startBracketIdx]);
	while (true) {
		const bracket = brackets.findIndex((bracket) =>
			bracket.sources?.some(
				(source) =>
					// empty array is the swiss early advance case
					(source.placements.includes(1) || source.placements.length === 0) &&
					source.bracketIdx === bracketIdxToFind,
			),
		);

		// -1 = end of the progression, already visited is only possible
		// with an invalid progression, see CYCLIC_PROGRESSION
		if (bracket === -1 || visited.has(bracket)) break;

		bracketIdxToFind = bracket;
		visited.add(bracketIdxToFind);
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
 * The order is so that most significant brackets (i.e. finals) appear first. A bracket always appears after every bracket
 * it advances teams to, so the teams it eliminated end up below the teams that advanced out of it.
 *
 * Underground brackets are omitted as they are only used to break ties within their source bracket, see `tiebrokenByUndergroundBrackets`.
 */
export function bracketIdxsForStandings(progression: ParsedBracket[]) {
	const bracketsToConsider = bracketsReachableFrom(0, progression);

	const ordered = destinationsFirstOrder(bracketsToConsider, progression);

	return ordered.filter((bracketIdx) => {
		const sources = progression[bracketIdx].sources;

		if (!sources) return true;

		return !sources.some(
			(source) =>
				(progression[source.bracketIdx].type === "double_elimination" ||
					progression[source.bracketIdx].type === "single_elimination") &&
				source.placements.some((placement) => placement < 0),
		);
	});
}

/**
 * Orders the given brackets so that every bracket appears after all the brackets it is a source of.
 * Among the brackets that are free to be placed next, the one whose teams placed the highest in the
 * deepest bracket they have in common (e.g. a top cut over a consolation bracket) goes first. The comparison
 * follows the whole route the teams took, so e.g. a bracket taking the low placements of a redemption bracket
 * can still rank above a bracket taking mid placements straight from the pools that fed that redemption bracket.
 */
function destinationsFirstOrder(
	bracketIdxs: number[],
	progression: ParsedBracket[],
): number[] {
	const included = new Set(bracketIdxs);

	const sourcedPlacements = new Map(
		bracketIdxs.map((bracketIdx) => [
			bracketIdx,
			ancestorPlacements(bracketIdx, progression),
		]),
	);

	const pendingDestinations = new Map(
		bracketIdxs.map((bracketIdx) => [
			bracketIdx,
			new Set(
				destinationsFromBracketIdx(bracketIdx, progression).filter(
					(destinationIdx) => included.has(destinationIdx),
				),
			),
		]),
	);

	const result: number[] = [];
	const remaining = new Set(bracketIdxs);

	while (remaining.size > 0) {
		const withoutPendingDestinations = Array.from(remaining).filter(
			(bracketIdx) => pendingDestinations.get(bracketIdx)!.size === 0,
		);
		// a cyclic progression is invalid but shouldn't cause an infinite loop here
		const candidates =
			withoutPendingDestinations.length > 0
				? withoutPendingDestinations
				: Array.from(remaining);

		const next = bestSourcedBracket(candidates, sourcedPlacements, progression);

		result.push(next);
		remaining.delete(next);

		for (const bracketIdx of remaining) {
			pendingDestinations.get(bracketIdx)!.delete(next);
		}
	}

	return result;
}

/** Of the given brackets, the one whose teams took the best route there, ties broken by the lowest bracket index. */
function bestSourcedBracket(
	bracketIdxs: number[],
	sourcedPlacements: Map<number, Map<number, number>>,
	progression: ParsedBracket[],
): number {
	let result = bracketIdxs[0];

	for (const bracketIdx of bracketIdxs.slice(1)) {
		const comparison = compareSourcedPlacements(
			sourcedPlacements.get(bracketIdx)!,
			sourcedPlacements.get(result)!,
			progression,
		);

		if (comparison < 0 || (comparison === 0 && bracketIdx < result)) {
			result = bracketIdx;
		}
	}

	return result;
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

/**
 * Returns the indexes of the underground brackets sourced from the given bracket.
 * An underground bracket is one that takes teams eliminated from its source bracket (negative placements).
 */
export function undergroundBracketIdxs(
	bracketIdx: number,
	progression: ParsedBracket[],
): number[] {
	return destinationsFromBracketIdx(bracketIdx, progression).filter((idx) =>
		progression[idx].sources?.some(
			(source) =>
				source.bracketIdx === bracketIdx &&
				source.placements.some((placement) => placement < 0),
		),
	);
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

/**
 * Orders a bracket's sources for seeding purposes. Teams sourced with a better placement
 * in a shared ancestor bracket seed above teams that took a longer route there, e.g. if the top cut
 * sources both the top 2 of "Day 1 Pools" directly and the winners of a "Redemption" bracket
 * (itself sourcing pools placements 3-4), the direct pools source is ordered first.
 *
 * Sources that share no ancestor bracket keep their original relative order.
 */
export function sortedSourcesForSeeding(
	sources: DBSource[],
	progression: ParsedBracket[],
): DBSource[] {
	const placementMaps = sources.map((source) =>
		sourcePlacementsByBracket(source, progression),
	);

	return sources
		.map((source, idx) => ({ source, idx }))
		.sort((a, b) =>
			compareSourcedPlacements(
				placementMaps[a.idx],
				placementMaps[b.idx],
				progression,
			),
		)
		.map(({ source }) => source);
}

/** Best (lowest positive) placement the source's teams achieved in each bracket on their route, keyed by bracket index. */
function sourcePlacementsByBracket(
	source: DBSource,
	progression: ParsedBracket[],
): Map<number, number> {
	const result = new Map<number, number>();

	result.set(source.bracketIdx, bestPositivePlacement(source.placements));

	for (const [ancestorIdx, placement] of ancestorPlacements(
		source.bracketIdx,
		progression,
	)) {
		mergeMinPlacement(result, ancestorIdx, placement);
	}

	return result;
}

function ancestorPlacements(
	bracketIdx: number,
	progression: ParsedBracket[],
	visited: Set<number> = new Set(),
): Map<number, number> {
	const result = new Map<number, number>();

	if (visited.has(bracketIdx)) return result;
	visited.add(bracketIdx);

	for (const source of progression[bracketIdx].sources ?? []) {
		mergeMinPlacement(
			result,
			source.bracketIdx,
			bestPositivePlacement(source.placements),
		);

		for (const [ancestorIdx, placement] of ancestorPlacements(
			source.bracketIdx,
			progression,
			visited,
		)) {
			mergeMinPlacement(result, ancestorIdx, placement);
		}
	}

	return result;
}

function bestPositivePlacement(placements: number[]) {
	const positives = placements.filter((placement) => placement > 0);

	// empty placements = swiss early advancers i.e. the top teams of that bracket
	if (positives.length === 0 && placements.length === 0) return 1;

	// negative placements only = teams eliminated from the source bracket
	if (positives.length === 0) return Number.POSITIVE_INFINITY;

	return Math.min(...positives);
}

function mergeMinPlacement(
	map: Map<number, number>,
	bracketIdx: number,
	placement: number,
) {
	const existing = map.get(bracketIdx);
	if (existing === undefined || placement < existing) {
		map.set(bracketIdx, placement);
	}
}

/** Compares two routes by the placement they got in the deepest bracket they have in common. */
function compareSourcedPlacements(
	placementsA: Map<number, number>,
	placementsB: Map<number, number>,
	progression: ParsedBracket[],
): number {
	const commonBracketIdx = deepestCommonBracket(
		placementsA,
		placementsB,
		progression,
	);
	if (commonBracketIdx === null) return 0;

	const placementA = placementsA.get(commonBracketIdx)!;
	const placementB = placementsB.get(commonBracketIdx)!;

	if (placementA === placementB) return 0;

	return placementA - placementB;
}

function deepestCommonBracket(
	placementsA: Map<number, number>,
	placementsB: Map<number, number>,
	progression: ParsedBracket[],
): number | null {
	let result: number | null = null;
	let resultDepth = -1;

	for (const bracketIdx of placementsA.keys()) {
		if (!placementsB.has(bracketIdx)) continue;

		const depth = bracketDepth(bracketIdx, progression);
		if (depth > resultDepth) {
			result = bracketIdx;
			resultDepth = depth;
		}
	}

	return result;
}
