import { z } from "zod";
import { CALENDAR_EVENT_RESULT } from "~/constants";
import { type CalendarEventTag, TOURNAMENT_STAGE_TYPES } from "~/db/tables";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import "~/styles/calendar-new.css";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import {
	actualNumber,
	gamesShortSchema,
	id,
	modeShortWithSpecial,
	safeJSONParse,
	toArray,
} from "~/utils/zod";
import { CALENDAR_EVENT } from "./calendar-constants";

export const calendarEventTagSchema = z
	.string()
	.refine((val) => CALENDAR_EVENT.TAGS.includes(val as CalendarEventTag));

const calendarFiltersPlainStringArr = z.array(z.string().max(100)).max(10);
const calendarFiltersIdsArr = z.array(id).max(10);
const calendarFilterGamesArr = z.array(gamesShortSchema).min(1).max(3);
const preferredStartTime = z.enum(["ANY", "EU", "NA", "AU"]);
const preferredVersus = z
	.array(z.enum(versusShort))
	.min(1)
	.max(versusShort.length);
const modeArr = z
	.array(modeShortWithSpecial)
	.min(1)
	.max(modesShortWithSpecial.length);

export const calendarFiltersSearchParamsSchema = z.object({
	preferredStartTime: preferredStartTime.catch("ANY"),
	tagsIncluded: z.array(calendarEventTagSchema).catch([]),
	tagsExcluded: z.array(calendarEventTagSchema).catch([]),
	isSendou: z.boolean().catch(false),
	isRanked: z.boolean().catch(false),
	orgsIncluded: calendarFiltersPlainStringArr.catch([]),
	orgsExcluded: calendarFiltersPlainStringArr.catch([]),
	authorIdsExcluded: calendarFiltersIdsArr.catch([]),
	games: calendarFilterGamesArr.catch([...gamesShort]),
	preferredVersus: preferredVersus.catch([...versusShort]),
	modes: modeArr.catch([...modesShortWithSpecial]),
	modesExact: z.boolean().catch(false),
	minTeamCount: z.coerce.number().int().nonnegative().catch(0),
});

export const calendarFiltersFormSchema = z
	.object({
		preferredStartTime: preferredStartTime,
		tagsIncluded: z.array(calendarEventTagSchema),
		tagsExcluded: z.array(calendarEventTagSchema),
		isSendou: z.boolean(),
		isRanked: z.boolean(),
		orgsIncluded: calendarFiltersPlainStringArr,
		orgsExcluded: calendarFiltersPlainStringArr,
		authorIdsExcluded: calendarFiltersIdsArr,
		games: calendarFilterGamesArr,
		preferredVersus: preferredVersus,
		modes: modeArr,
		modesExact: z.boolean(),
		minTeamCount: z.coerce.number().int().nonnegative(),
	})
	.superRefine((filters, ctx) => {
		if (
			filters.tagsIncluded.some((tag) => filters.tagsExcluded.includes(tag))
		) {
			ctx.addIssue({
				path: ["tagsExcluded"],
				message: "Can't include and exclude the same tag",
				code: z.ZodIssueCode.custom,
			});
		}

		if (filters.orgsIncluded.length > 0 && filters.orgsExcluded.length > 0) {
			ctx.addIssue({
				path: ["orgsExcluded"],
				message: "Can't both include and exclude organizations",
				code: z.ZodIssueCode.custom,
			});
		}
	});

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
