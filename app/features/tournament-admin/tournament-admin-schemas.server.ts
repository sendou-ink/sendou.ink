import { z } from "zod";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { _action, id, safeJSONParse } from "~/utils/zod";
import { bracketProgressionSchema } from "../calendar/calendar-schemas";
import {
	bracketIdx,
	tournamentRoundMaps,
} from "../tournament-bracket/tournament-bracket-schemas.server";
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
	z.object({
		_action: _action("EDIT_ROUND_MAPS"),
		bracketIdx,
		maps: z.preprocess(safeJSONParse, z.array(tournamentRoundMaps)),
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
