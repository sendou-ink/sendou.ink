import { z } from "zod";
import { CALENDAR_EVENT_RESULT } from "~/constants";
import {
	actualNumber,
	id,
	safeJSONParse,
	safeSplit,
	toArray,
} from "~/utils/zod";
import { calendarEventTagSchema } from "./actions/calendar.new.server";

const playersSchema = z
	.array(
		z.union([
			z.string().min(1).max(CALENDAR_EVENT_RESULT.MAX_PLAYER_NAME_LENGTH),
			z.object({ id }),
		]),
	)
	.nonempty({ message: "forms.errors.emptyTeam" })
	.max(CALENDAR_EVENT_RESULT.MAX_PLAYERS_LENGTH)
	.refine(
		(val) => {
			const userIds = val.flatMap((user) =>
				typeof user === "string" ? [] : user.id,
			);

			return userIds.length === new Set(userIds).size;
		},
		{
			message: "forms.errors.duplicatePlayer",
		},
	);

export const reportWinnersActionSchema = z.object({
	participantCount: z.preprocess(
		actualNumber,
		z
			.number()
			.int()
			.positive()
			.max(CALENDAR_EVENT_RESULT.MAX_PARTICIPANTS_COUNT),
	),
	team: z.preprocess(
		toArray,
		z
			.array(
				z.preprocess(
					safeJSONParse,
					z.object({
						teamName: z
							.string()
							.min(1)
							.max(CALENDAR_EVENT_RESULT.MAX_TEAM_NAME_LENGTH),
						placement: z.preprocess(
							actualNumber,
							z
								.number()
								.int()
								.positive()
								.max(CALENDAR_EVENT_RESULT.MAX_TEAM_PLACEMENT),
						),
						players: playersSchema,
					}),
				),
			)
			.refine(
				(val) => val.length === new Set(val.map((team) => team.teamName)).size,
				{ message: "forms.errors.uniqueTeamName" },
			),
	),
});

export const reportWinnersParamsSchema = z.object({
	id: z.preprocess(actualNumber, id),
});

export const loaderWeekSearchParamsSchema = z.object({
	week: z.preprocess(actualNumber, z.number().int().min(1).max(53)),
	year: z.preprocess(actualNumber, z.number().int()),
});

export const loaderFilterSearchParamsSchema = z.object({
	tags: z.preprocess(safeSplit(), z.array(calendarEventTagSchema)),
});

export const loaderTournamentsOnlySearchParamsSchema = z.object({
	tournaments: z.literal("true").nullish(),
});
