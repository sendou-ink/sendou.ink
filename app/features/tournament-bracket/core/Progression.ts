// todo

import type { Tables, TournamentStageSettings } from "~/db/tables";
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
}

// Note sources is array for future proofing reasons. Currently the array is always of length 1 if it exists.

export interface InputBracket extends BracketBase {
	id: string;
	sources?: EditableSource[];
}

export interface ValidatedBracket extends BracketBase {
	sources?: DBSource[];
}

export type ValidationError =
	// user written placements can not be parsed
	| {
			type: "PLACEMENTS_PARSE_ERROR";
			bracketId: string;
	  }
	// tournament is ending with a format that does not resolve a winner such as round robin or grouped swiss
	| {
			type: "NOT_RESOLVING_WINNER";
	  }
	// from each bracket one placement can lead to only one bracket
	| {
			type: "SAME_PLACEMENT_TO_TWO_BRACKETS";
			bracketIds: string[];
	  }
	// from one bracket e.g. if 1st goes somewhere and 3rd goes somewhere then 2nd must also go somewhere
	| {
			type: "GAP_IN_PLACEMENTS";
			bracketId: string;
	  }
	// if round robin groups size is 4 then it doesn't make sense to have destination for 5
	| {
			type: "TOO_MANY_PLACEMENTS";
			bracketId: string;
	  }
	// two brackets can not have the same name
	| {
			type: "DUPLICATE_BRACKET_NAME";
			bracketIds: string[];
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

/** Takes bracket progression as entered by user as input and returns the validated brackets ready for input to the database or errors if any. */
export function validatedSources(
	brackets: InputBracket[],
): ValidatedBracket[] | ValidationError {
	let parsed: ValidatedBracket[];
	try {
		parsed = toOutputBracketFormat(brackets);
	} catch (e) {
		if ((e as { badBracketId: string }).badBracketId) {
			return {
				type: "PLACEMENTS_PARSE_ERROR",
				bracketId: (e as { badBracketId: string }).badBracketId,
			};
		}

		throw e;
	}

	if (!resolvesWinner(parsed)) {
		return {
			type: "NOT_RESOLVING_WINNER",
		};
	}

	return parsed;
}

function toOutputBracketFormat(brackets: InputBracket[]): ValidatedBracket[] {
	const result = brackets.map((bracket) => {
		const { id, sources, ...rest } = bracket;

		return {
			...rest,
			sources: sources?.map((source) => {
				const placements = parsePlacements(source.placements);
				if (!placements) {
					throw { badBracketId: bracket.id };
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

function resolvesWinner(brackets: ValidatedBracket[]) {
	return true;
}

// xxx: tests & export?
function resolveFinals() {}
