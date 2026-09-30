import * as v from "valibot";
import {
	TOURNAMENT,
	TOURNAMENT_STAGE_TYPES,
} from "~/features/tournament/tournament-constants";
import * as Swiss from "~/features/tournament-bracket/core/engine/swiss/team-status";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	_action,
	id,
	preprocess,
	safeJSONParse,
	superRefine,
} from "~/utils/schema";
import { bracketIdx } from "../tournament-bracket/tournament-bracket-schemas";
import { adminStaffFormSchema } from "./tournament-admin-staff-schemas";

/** {@link adminStaffFormSchema} plus the server-only rule that the author (always shown as organizer) can't be added as staff. */
export function adminStaffFormSchemaServer({
	tournament,
}: {
	tournament: Tournament;
}) {
	return v.pipe(
		adminStaffFormSchema,
		superRefine((data, ctx) => {
			for (const [index, staffer] of data.staff.entries()) {
				if (staffer.userId === tournament.ctx.author.id) {
					ctx.addIssue({
						message: "forms:errors.staffCannotBeAuthor",
						path: ["staff", index, "userId"],
					});
				}
			}
		}),
	);
}

export const adminTeamsActionSchema = v.union([
	v.object({
		_action: _action("CHECK_IN"),
		teamId: id,
		bracketIdx,
	}),
	v.object({
		_action: _action("CHECK_OUT"),
		teamId: id,
		bracketIdx,
	}),
	v.object({
		_action: _action("DELETE_TEAM"),
		teamId: id,
	}),
	v.object({
		_action: _action("DROP_TEAM_OUT"),
		teamId: id,
	}),
	v.object({
		_action: _action("UNDO_DROP_TEAM_OUT"),
		teamId: id,
	}),
]);

const bracketProgressionSchema = preprocess(
	safeJSONParse,
	v.pipe(
		v.array(
			v.object({
				type: v.picklist(TOURNAMENT_STAGE_TYPES),
				name: v.pipe(
					v.string(),
					v.minLength(1),
					v.maxLength(TOURNAMENT.BRACKET_NAME_MAX_LENGTH),
				),
				settings: v.pipe(
					v.object({
						thirdPlaceMatch: v.optional(v.boolean()),
						teamsPerGroup: v.optional(v.pipe(v.number(), v.integer())),
						hasAbDivisions: v.optional(v.boolean()),
						groupCount: v.optional(v.pipe(v.number(), v.integer())),
						roundCount: v.optional(v.pipe(v.number(), v.integer())),
						advanceThreshold: v.optional(v.pipe(v.number(), v.integer())),
					}),
					superRefine((settings, ctx) => {
						if (!settings.advanceThreshold) return;

						const isValid = Swiss.isValidAdvanceThreshold({
							roundCount:
								settings.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT,
							advanceThreshold: settings.advanceThreshold,
						});
						if (isValid) return;

						ctx.addIssue({
							message: "Invalid advance threshold for the given round count",
							path: ["advanceThreshold"],
						});
					}),
				),
				requiresCheckIn: v.boolean(),
				startTime: v.optional(v.number()),
				sources: v.optional(
					v.array(
						v.object({
							bracketIdx: v.number(),
							placements: v.array(v.number()),
							rest: v.optional(v.boolean()),
						}),
					),
				),
			}),
		),
		v.check(
			(progression) =>
				Progression.bracketsToValidationError(progression) === null,
			"Invalid bracket progression",
		),
	),
);

export const adminBracketsActionSchema = v.union([
	v.object({
		_action: _action("RESET_BRACKET"),
		stageId: id,
	}),
	v.object({
		_action: _action("UPDATE_TOURNAMENT_PROGRESSION"),
		bracketProgression: bracketProgressionSchema,
	}),
	v.object({
		_action: _action("REOPEN_TOURNAMENT"),
	}),
]);

export const adminSeedsActionSchema = v.union([
	v.object({
		_action: _action("UPDATE_SEEDS"),
		seeds: preprocess(safeJSONParse, v.array(id)),
	}),
	v.object({
		_action: _action("UPDATE_STARTING_BRACKETS"),
		startingBrackets: preprocess(
			safeJSONParse,
			v.array(
				v.object({
					tournamentTeamId: id,
					startingBracketIdx: bracketIdx,
				}),
			),
		),
	}),
	v.object({
		_action: _action("UPDATE_AB_DIVISIONS"),
		abDivisions: preprocess(
			safeJSONParse,
			v.array(
				v.object({
					tournamentTeamId: id,
					abDivision: v.union([v.literal(0), v.literal(1), v.null()]),
				}),
			),
		),
	}),
]);
