import { z } from "zod";
import { CALENDAR_EVENT_RESULT } from "~/constants";
import {
	type PersistedCalendarEventTag,
	TOURNAMENT_STAGE_TYPES,
} from "~/db/tables";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import "~/styles/calendar-new.css";
import { actualNumber, id, safeJSONParse, toArray } from "~/utils/zod";
import { CALENDAR_EVENT } from "./calendar-constants";

export const calendarEventTagSchema = z
	.string()
	.refine((val) =>
		CALENDAR_EVENT.PERSISTED_TAGS.includes(val as PersistedCalendarEventTag),
	);

export const calendarFiltersSchema = z.object({
	// xxx:  startTime
	tagsIncluded: z.array(calendarEventTagSchema).catch([]),
	tagsExcluded: z.array(calendarEventTagSchema).catch([]),
	isSendou: z.boolean().catch(false),
	isRanked: z.boolean().catch(false),
	orgsIncluded: z.array(z.string().max(100)).max(10).catch([]),
	orgsExcluded: z.array(z.string().max(100)).max(10).catch([]),
	// xxx: authorDiscordIdsExcluded
	// xxx:  games... S1/S2/S3
	// xxx:  modes... TW/SZ/TC/RM/CB/SR/TB
	// xxx:  modesExact
}); // xxx: refine, no overlapping tags

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

export const bracketProgressionSchema = z.preprocess(
	safeJSONParse,
	z
		.array(
			z.object({
				type: z.enum(TOURNAMENT_STAGE_TYPES),
				name: z.string().min(1).max(TOURNAMENT.BRACKET_NAME_MAX_LENGTH),
				settings: z.object({
					thirdPlaceMatch: z.boolean().optional(),
					teamsPerGroup: z.number().int().optional(),
					groupCount: z.number().int().optional(),
					roundCount: z.number().int().optional(),
				}),
				requiresCheckIn: z.boolean(),
				startTime: z.number().optional(),
				sources: z
					.array(
						z.object({
							bracketIdx: z.number(),
							placements: z.array(z.number()),
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
