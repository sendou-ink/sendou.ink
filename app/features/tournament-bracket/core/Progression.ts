// todo

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
			bracketIdx: number;
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
	  }
	// bracket cannot be both source and destination at the same time
	| {
			type: "CIRCULAR_PROGRESSION";
	  }
	// negative progression (e.g. losers of first round go somewhere) is only for elimination bracket
	| {
			type: "NEGATIVE_PROGRESSION";
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
	let faultyBracketIdx: number | null = null;
	let faultyBracketIdxs: number[] | null = null;

	if (!resolvesWinner(brackets)) {
		return {
			type: "NOT_RESOLVING_WINNER",
		};
	}

	faultyBracketIdxs = samePlacementToMultipleBrackets(brackets);
	if (faultyBracketIdxs) {
		return {
			type: "SAME_PLACEMENT_TO_MULTIPLE_BRACKETS",
			bracketIdxs: faultyBracketIdxs,
		};
	}

	faultyBracketIdx = gapInPlacements(brackets);
	if (faultyBracketIdx) {
		return {
			type: "GAP_IN_PLACEMENTS",
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

function gapInPlacements(_brackets: ParsedBracket[]) {
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
