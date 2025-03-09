// todo

import compare from "just-compare";
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
	/** Team placements that join this bracket. E.g. [1, 2] would mean top 1 & 2 teams. [-1] would mean the last placing teams. */
	placements: number[];
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
				placements: placementsToString(source.placements),
			})),
		};
	});
}

function placementsToString(placements: number[]): string {
	if (placements.length === 0) return "";

	placements.sort((a, b) => a - b);

	if (placements.some((p) => p < 0)) {
		placements.sort((a, b) => b - a);
		return placements.join(",");
	}

	const ranges: string[] = [];
	let start = placements[0];
	let end = placements[0];

	for (let i = 1; i < placements.length; i++) {
		if (placements[i] === end + 1) {
			end = placements[i];
		} else {
			if (start === end) {
				ranges.push(`${start}`);
			} else {
				ranges.push(`${start}-${end}`);
			}
			start = placements[i];
			end = placements[i];
		}
	}

	if (start === end) {
		ranges.push(String(start));
	} else {
		ranges.push(`${start}-${end}`);
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
				const placements = parsePlacements(source.placements);
				if (!placements) {
					throw { badBracketIdx: bracketIdx };
				}

				return {
					bracketIdx: brackets.findIndex((b) => b.id === source.bracketId),
					placements,
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

function parsePlacements(placements: string) {
	const parts = placements.split(",");

	const result: number[] = [];

	for (let part of parts) {
		part = part.trim();

		const isNegative = part.match(/^-\d+$/);
		if (isNegative) {
			result.push(Number(part));
			continue;
		}

		const isValid = part.match(/^\d+(-\d+)?$/);
		if (!isValid) return null;

		if (part.includes("-")) {
			const [start, end] = part.split("-").map(Number);

			for (let i = start; i <= end; i++) {
				result.push(i);
			}
		} else {
			result.push(Number(part));
		}
	}

	return result;
}

function resolvesWinner(brackets: ParsedBracket[]) {
	const finals = brackets.find((_, idx) => isFinals(idx, brackets));

	if (!finals) return false;
	if (finals?.type === "round_robin") return false;
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
		}
	}

	const result: number[] = [];

	for (const [_, bracketIdxs] of map) {
		if (bracketIdxs.length > 1) {
			result.push(...bracketIdxs);
		}
	}

	return result.length ? result : null;
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
	// technically not correct but i guess not too common to have different round robins in the same bracket
	const size = Math.min(
		...roundRobins.map(
			(bracketIdx) =>
				brackets[bracketIdx].settings.teamsPerGroup ?? Number.POSITIVE_INFINITY,
		),
	);

	for (const [bracketIdx, bracket] of brackets.entries()) {
		for (const source of bracket.sources ?? []) {
			if (
				roundRobins.includes(source.bracketIdx) &&
				source.placements.some((placement) => placement > size)
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

/** Given bracketIdx and bracketProgression will resolve if this an "underground bracket".
 * Underground bracket is defined as a bracket that is not part of the main tournament progression e.g. optional bracket for early losers
 */
export function isUnderground(idx: number, brackets: ParsedBracket[]) {
	invariant(idx < brackets.length, "Bracket index out of bounds");

	return !resolveMainBracketProgression(brackets).includes(idx);
}

function resolveMainBracketProgression(brackets: ParsedBracket[]) {
	if (brackets.length === 1) return [0];

	let bracketIdxToFind = 0;
	const result = [0];
	while (true) {
		const bracket = brackets.findIndex((bracket) =>
			bracket.sources?.some(
				(source) =>
					source.placements.includes(1) &&
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

		if (!newBracket || !compare(oldBracket, newBracket)) {
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
			!compare(newBracket.settings, oldBracket.settings)
		) {
			return true;
		}
	}

	return false;
}

/** Returns the order of brackets as is to be considered for standings. Teams from the bracket of lower index are considered to be above those from the lower bracket.
 *  A participant's standing is the first bracket to appear in order that has the participant in it.
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

	return withoutUnderground.sort((a, b) => {
		const minSourcedPlacementA = Math.min(
			...(progression[a].sources?.flatMap((s) => s.placements) ?? [
				Number.POSITIVE_INFINITY,
			]),
		);
		const minSourcedPlacementB = Math.min(
			...(progression[b].sources?.flatMap((s) => s.placements) ?? [
				Number.POSITIVE_INFINITY,
			]),
		);

		if (minSourcedPlacementA === minSourcedPlacementB) {
			return a - b;
		}

		return minSourcedPlacementA - minSourcedPlacementB;
	});
}

function bracketsReachableFrom(
	bracketIdx: number,
	progression: ParsedBracket[],
): number[] {
	const result = [bracketIdx];

	for (const [newBracketIdx, bracket] of progression.entries()) {
		if (!bracket.sources) continue;

		for (const source of bracket.sources) {
			if (source.bracketIdx === bracketIdx) {
				result.push(...bracketsReachableFrom(newBracketIdx, progression));
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
		progression[destinationBracketIdx].sources?.some((source) =>
			source.placements.includes(placement),
		),
	);

	return destination ?? null;
}
