import * as Swiss from "@sendou/tournament-engine/swiss/team-status";
import { z } from "zod";
import {
	TOURNAMENT,
	TOURNAMENT_STAGE_TYPES,
} from "~/features/tournament/tournament-constants";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { _action, id, safeJSONParse } from "~/utils/zod";
import { bracketIdx } from "../tournament-bracket/tournament-bracket-schemas";
import { adminStaffFormSchema } from "./tournament-admin-staff-schemas";

/**
 * Extends the client {@link adminStaffFormSchema} with a server-only,
 * context-dependent validation: the tournament author can't be added as staff
 * (they are always shown as an organizer for info only).
 */
export function adminStaffFormSchemaServer({
	tournament,
}: {
	tournament: Tournament;
}) {
	return adminStaffFormSchema.superRefine((data, ctx) => {
		for (const [index, staffer] of data.staff.entries()) {
			if (staffer.userId === tournament.ctx.author.id) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "forms:errors.staffCannotBeAuthor",
					path: ["staff", index, "userId"],
				});
			}
		}
	});
}

export const adminTeamsActionSchema = z.union([
	z.object({
		_action: _action("CHECK_IN"),
		teamId: id,
		bracketIdx,
	}),
	z.object({
		_action: _action("CHECK_OUT"),
		teamId: id,
		bracketIdx,
	}),
	z.object({
		_action: _action("DELETE_TEAM"),
		teamId: id,
	}),
	z.object({
		_action: _action("DROP_TEAM_OUT"),
		teamId: id,
	}),
	z.object({
		_action: _action("UNDO_DROP_TEAM_OUT"),
		teamId: id,
	}),
]);

const bracketProgressionSchema = z.preprocess(
	safeJSONParse,
	z
		.array(
			z.object({
				type: z.enum(TOURNAMENT_STAGE_TYPES),
				name: z.string().min(1).max(TOURNAMENT.BRACKET_NAME_MAX_LENGTH),
				settings: z
					.object({
						thirdPlaceMatch: z.boolean().optional(),
						teamsPerGroup: z.number().int().optional(),
						hasAbDivisions: z.boolean().optional(),
						groupCount: z.number().int().optional(),
						roundCount: z.number().int().optional(),
						advanceThreshold: z.number().int().optional(),
					})
					.refine(
						(settings) => {
							if (settings.advanceThreshold) {
								return Swiss.isValidAdvanceThreshold({
									roundCount:
										settings.roundCount ?? TOURNAMENT.SWISS_DEFAULT_ROUND_COUNT,
									advanceThreshold: settings.advanceThreshold,
								});
							}
							return true;
						},
						{
							message: "Invalid advance threshold for the given round count",
							path: ["advanceThreshold"],
						},
					),
				requiresCheckIn: z.boolean(),
				startTime: z.number().optional(),
				sources: z
					.array(
						z.object({
							bracketIdx: z.number(),
							placements: z.array(z.number()),
							rest: z.boolean().optional(),
						}),
					)
					.optional(),
			}),
		)
		.refine(
			(progression) =>
				Progression.bracketsToValidationError(progression) === null,
			"Invalid bracket progression",
		),
);

export const adminBracketsActionSchema = z.union([
	z.object({
		_action: _action("RESET_BRACKET"),
		stageId: id,
	}),
	z.object({
		_action: _action("UPDATE_TOURNAMENT_PROGRESSION"),
		bracketProgression: bracketProgressionSchema,
	}),
	z.object({
		_action: _action("REOPEN_TOURNAMENT"),
	}),
]);

export const adminSeedsActionSchema = z.union([
	z.object({
		_action: _action("UPDATE_SEEDS"),
		seeds: z.preprocess(safeJSONParse, z.array(id)),
	}),
	z.object({
		_action: _action("UPDATE_STARTING_BRACKETS"),
		startingBrackets: z.preprocess(
			safeJSONParse,
			z.array(
				z.object({
					tournamentTeamId: id,
					startingBracketIdx: bracketIdx,
				}),
			),
		),
	}),
	z.object({
		_action: _action("UPDATE_AB_DIVISIONS"),
		abDivisions: z.preprocess(
			safeJSONParse,
			z.array(
				z.object({
					tournamentTeamId: id,
					abDivision: z.union([z.literal(0), z.literal(1), z.null()]),
				}),
			),
		),
	}),
]);
