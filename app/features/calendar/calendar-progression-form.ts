import * as v from "valibot";
import type { Tables } from "~/db/tables";
import type { TournamentStageSettings } from "~/db/tables-json";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import {
	array,
	datetimeOptional,
	fieldset,
	radioGroup,
	select,
	selectDynamic,
	textField,
	textFieldOptional,
	toggle,
} from "~/form/fields";
import { superRefine, type ValidationCtx } from "~/utils/schema";
import { assertUnreachable } from "~/utils/types";

const SWISS_DEFAULT_ADVANCE_THRESHOLD = 3;

export interface BracketFormValue {
	name: string;
	type: Tables["TournamentStage"]["type"];
	thirdPlaceMatch: boolean;
	teamsPerGroup: string;
	hasAbDivisions: boolean;
	groupCount: string;
	roundCount: string;
	earlyAdvance: boolean;
	advanceThreshold: string;
	startTime?: Date | null;
	requiresCheckIn: boolean;
}

export interface ProgressionSourceFormValue {
	/** Index of the source bracket in the `brackets` form field, as a string (select value). */
	bracketIdx: string;
	placements: string | null;
}

export interface ProgressionFormValue {
	source: "SIGN_UP" | "BRACKET";
	sources: ProgressionSourceFormValue[];
}

// extracted so their literal item values don't widen to `string` in the
// fieldset's inferred value type
const bracketTypeField = select({
	label: "labels.format",
	items: [
		{
			value: "single_elimination",
			label: "options.format.single_elimination",
		},
		{
			value: "double_elimination",
			label: "options.format.double_elimination",
		},
		{ value: "round_robin", label: "options.format.round_robin" },
		{ value: "swiss", label: "options.format.swiss" },
	],
	initialValue: "double_elimination",
});

const progressionSourceField = radioGroup({
	label: "labels.teamsJoinFrom",
	items: [
		{ value: "SIGN_UP", label: "options.bracketSource.SIGN_UP" },
		{ value: "BRACKET", label: "options.bracketSource.BRACKET" },
	],
});

const bracketFieldset = fieldset({
	fields: v.object({
		name: textField({
			label: "labels.bracketName",
			maxLength: TOURNAMENT.BRACKET_NAME_MAX_LENGTH,
		}),
		type: bracketTypeField,
		thirdPlaceMatch: toggle({
			label: "labels.thirdPlaceMatch",
			initialValue: TOURNAMENT.SE_DEFAULT_HAS_THIRD_PLACE_MATCH,
		}),
		teamsPerGroup: selectDynamic({
			label: "labels.teamsPerGroup",
			bottomText: "bottomTexts.teamsPerGroup",
			initialValue: String(TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP),
		}),
		hasAbDivisions: toggle({
			label: "labels.abDivisions",
			bottomText: "bottomTexts.abDivisions",
		}),
		groupCount: select({
			label: "labels.groupCount",
			items: [1, 2, 3, 4, 5, 6].map((count) => ({
				value: String(count),
				label: () => String(count),
			})),
			initialValue: String(TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT),
		}),
		roundCount: select({
			label: "labels.roundCount",
			items: [3, 4, 5, 6, 7, 8].map((count) => ({
				value: String(count),
				label: () => String(count),
			})),
			initialValue: String(TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT),
		}),
		earlyAdvance: toggle({
			label: "labels.earlyAdvance",
			bottomText: "bottomTexts.earlyAdvance",
		}),
		advanceThreshold: selectDynamic({
			label: "labels.advanceThreshold",
			initialValue: String(SWISS_DEFAULT_ADVANCE_THRESHOLD),
		}),
		startTime: datetimeOptional({
			label: "labels.startTime",
			bottomText: "bottomTexts.bracketStartTime",
		}),
		requiresCheckIn: toggle({
			label: "labels.requiresCheckIn",
			bottomText: "bottomTexts.requiresCheckIn",
		}),
	}),
});

const progressionSourceFieldset = fieldset({
	fields: v.object({
		bracketIdx: selectDynamic({
			label: "labels.sourceBracket",
			initialValue: "0",
		}),
		placements: textFieldOptional({
			label: "labels.placements",
			placeholder: "placeholders.placements",
			maxLength: 100,
		}),
	}),
});

const progressionEntryFieldset = fieldset({
	fields: v.object({
		source: progressionSourceField,
		sources: array({
			min: 1,
			max: TOURNAMENT.MAX_BRACKETS_PER_TOURNAMENT - 1,
			field: progressionSourceFieldset,
		}),
	}),
});

export const bracketsFormField = array({
	label: "labels.brackets",
	max: TOURNAMENT.MAX_BRACKETS_PER_TOURNAMENT,
	field: bracketFieldset,
});

export const progressionFormField = array({
	label: "labels.progression",
	max: TOURNAMENT.MAX_BRACKETS_PER_TOURNAMENT,
	field: progressionEntryFieldset,
	addable: false,
});

/** Standalone schema for forms that edit only the bracket progression (tournament admin page). */
export const bracketProgressionFormSchema = v.pipe(
	v.object({
		brackets: bracketsFormField,
		progression: progressionFormField,
	}),
	superRefine((data, ctx) => {
		validateBracketProgressionFormValues(data.brackets, data.progression, ctx);
	}),
);

/** Form field values of a new tournament's single starting bracket. Used to seed form default values. */
export function defaultBracketsFormValues(): {
	brackets: BracketFormValue[];
	progression: ProgressionFormValue[];
} {
	return {
		brackets: [{ ...newBracketFormValue(), name: "Main Bracket" }],
		progression: [{ source: "SIGN_UP", sources: [newProgressionSource()] }],
	};
}

function newBracketFormValue(): BracketFormValue {
	return {
		name: "",
		type: "double_elimination",
		thirdPlaceMatch: TOURNAMENT.SE_DEFAULT_HAS_THIRD_PLACE_MATCH,
		teamsPerGroup: String(TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP),
		hasAbDivisions: false,
		groupCount: String(TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT),
		roundCount: String(TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT),
		earlyAdvance: false,
		advanceThreshold: String(SWISS_DEFAULT_ADVANCE_THRESHOLD),
		startTime: null,
		requiresCheckIn: false,
	};
}

/** Progression form field value appended when a new bracket is added: a follow-up bracket sourcing teams from the first bracket. */
export function newFollowUpProgressionEntry(): ProgressionFormValue {
	return { source: "BRACKET", sources: [newProgressionSource()] };
}

/** Source form field value of a bracket that takes its teams from the first bracket. */
export function newProgressionSource(): ProgressionSourceFormValue {
	return { bracketIdx: "0", placements: "" };
}

/** Converts the `brackets` + `progression` form values into {@link Progression.InputBracket} format ready for validation. */
export function formValuesToInputBrackets(
	brackets: BracketFormValue[],
	progression: ProgressionFormValue[],
): Progression.InputBracket[] {
	return brackets.map((bracket, bracketIdx) => {
		const entry = progression[bracketIdx];
		const isFollowUp = bracketIdx > 0 && entry?.source === "BRACKET";

		if (!isFollowUp) {
			return {
				id: String(bracketIdx),
				name: bracket.name,
				type: bracket.type,
				settings: settingsFromFormValues(bracket, true),
				requiresCheckIn: false,
			};
		}

		return {
			id: String(bracketIdx),
			name: bracket.name,
			type: bracket.type,
			settings: settingsFromFormValues(bracket, false),
			requiresCheckIn: bracket.requiresCheckIn,
			startTime: bracket.startTime ?? undefined,
			sources: entry.sources.map((source) => ({
				bracketId: source.bracketIdx,
				placements: sourceBracketHasEarlyAdvance(brackets, source)
					? ""
					: (source.placements ?? ""),
			})),
		};
	});
}

/** Converts stored bracket progression into the `brackets` + `progression` form field values. */
export function progressionToFormValues(
	progression: Progression.ParsedBracket[],
): {
	brackets: BracketFormValue[];
	progression: ProgressionFormValue[];
} {
	const input = Progression.validatedBracketsToInputFormat(progression);

	return {
		brackets: input.map((bracket) => ({
			name: bracket.name,
			type: bracket.type,
			thirdPlaceMatch: Boolean(
				bracket.settings.thirdPlaceMatch ??
					TOURNAMENT.SE_DEFAULT_HAS_THIRD_PLACE_MATCH,
			),
			teamsPerGroup: String(
				bracket.settings.teamsPerGroup ??
					TOURNAMENT.RR_DEFAULT_TEAM_COUNT_PER_GROUP,
			),
			hasAbDivisions: Boolean(bracket.settings.hasAbDivisions),
			groupCount: String(
				bracket.settings.groupCount ?? TOURNAMENT.SWISS_DEFAULT_GROUP_COUNT,
			),
			roundCount: String(
				bracket.settings.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT,
			),
			earlyAdvance: typeof bracket.settings.advanceThreshold === "number",
			advanceThreshold: String(
				bracket.settings.advanceThreshold ?? SWISS_DEFAULT_ADVANCE_THRESHOLD,
			),
			startTime: bracket.startTime ?? null,
			requiresCheckIn: bracket.requiresCheckIn,
		})),
		progression: input.map((bracket) => ({
			source: bracket.sources ? "BRACKET" : "SIGN_UP",
			sources: bracket.sources?.length
				? bracket.sources.map((source) => ({
						bracketIdx: source.bracketId,
						placements: source.placements,
					}))
				: [newProgressionSource()],
		})),
	};
}

/** Does the bracket of the given progression source advance teams via a Swiss early advance threshold (meaning placements are not specified)? */
export function sourceBracketHasEarlyAdvance(
	brackets: BracketFormValue[],
	source: ProgressionSourceFormValue,
) {
	const sourceBracket = brackets[Number(source.bracketIdx)];
	return sourceBracket?.type === "swiss" && sourceBracket.earlyAdvance;
}

/** Validates the `brackets` + `progression` form values together via {@link Progression.validatedBrackets}, attaching each error to the closest form field. */
export function validateBracketProgressionFormValues(
	brackets: BracketFormValue[],
	progression: ProgressionFormValue[],
	ctx: ValidationCtx,
) {
	for (const [entryIdx, entry] of progression.entries()) {
		if (entryIdx === 0 || entry.source !== "BRACKET") continue;

		for (const [sourceRowIdx, source] of entry.sources.entries()) {
			const sourceIdx = Number(source.bracketIdx);
			if (
				!Number.isInteger(sourceIdx) ||
				String(sourceIdx) !== source.bracketIdx ||
				sourceIdx < 0 ||
				sourceIdx >= brackets.length ||
				sourceIdx === entryIdx
			) {
				ctx.addIssue({
					message: "forms:errors.invalidSourceBracket",
					path: [
						"progression",
						entryIdx,
						"sources",
						sourceRowIdx,
						"bracketIdx",
					],
				});
				return;
			}
		}
	}

	const validated = Progression.validatedBrackets(
		formValuesToInputBrackets(brackets, progression),
	);
	if (!Progression.isError(validated)) return;

	for (const path of progressionErrorPaths(validated)) {
		ctx.addIssue({
			message:
				validated.type === "PLACEMENT_TOO_HIGH"
					? "forms:errors.placementTooHigh"
					: `tournament:progression.error.${validated.type}`,
			path,
		});
	}
}

function progressionErrorPaths(
	error: Progression.ValidationError,
): Array<Array<string | number>> {
	switch (error.type) {
		case "NOT_RESOLVING_WINNER":
			return [["progression"]];
		case "NAME_MISSING":
			return [["brackets", error.bracketIdx, "name"]];
		case "DUPLICATE_BRACKET_NAME":
			return error.bracketIdxs.map((idx) => ["brackets", idx, "name"]);
		case "SWISS_EARLY_ADVANCE_NO_DESTINATION":
			return [["brackets", error.bracketIdx, "earlyAdvance"]];
		case "AB_DIVISIONS_NOT_ROUND_ROBIN":
		case "AB_DIVISIONS_NOT_STARTING":
		case "AB_DIVISIONS_ODD_TEAMS_PER_GROUP":
			return [["brackets", error.bracketIdx, "hasAbDivisions"]];
		case "SAME_PLACEMENT_TO_MULTIPLE_BRACKETS":
		case "GAP_IN_PLACEMENTS":
		case "CYCLIC_PROGRESSION":
			return error.bracketIdxs.map((idx) => ["progression", idx, "sources"]);
		// a bracket can have many sources but the error only identifies the bracket,
		// so the message attaches to the sources list rather than one source's placements
		case "PLACEMENTS_PARSE_ERROR":
		case "TOO_MANY_PLACEMENTS":
		case "PLACEMENT_TOO_HIGH":
		case "NEGATIVE_PROGRESSION":
		case "MIXED_POSITIVE_NEGATIVE_PLACEMENTS":
		case "DUPLICATE_SOURCE_BRACKET":
		case "EMPTY_PLACEMENTS_ON_NON_SWISS":
		case "MERGED_STARTING_BRACKETS":
			return [["progression", error.bracketIdx, "sources"]];
		default:
			assertUnreachable(error);
	}
}

function settingsFromFormValues(
	bracket: BracketFormValue,
	isStartingBracket: boolean,
): TournamentStageSettings {
	switch (bracket.type) {
		case "single_elimination":
			return { thirdPlaceMatch: bracket.thirdPlaceMatch };
		case "double_elimination":
			return {};
		case "round_robin":
			return {
				teamsPerGroup: Number(bracket.teamsPerGroup),
				...(isStartingBracket && bracket.hasAbDivisions
					? { hasAbDivisions: true }
					: {}),
			};
		case "swiss":
			return {
				groupCount: Number(bracket.groupCount),
				roundCount: Number(bracket.roundCount),
				...(bracket.earlyAdvance
					? { advanceThreshold: Number(bracket.advanceThreshold) }
					: {}),
			};
		default:
			assertUnreachable(bracket.type);
	}
}
