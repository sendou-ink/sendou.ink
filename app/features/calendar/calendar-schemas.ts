import { z } from "zod";
import { CALENDAR_EVENT_RESULT } from "~/constants";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import "~/styles/calendar-new.css";
import {
	type PersistedCalendarEventTag,
	TOURNAMENT_STAGE_TYPES,
} from "~/db/tables";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import {
	actualNumber,
	checkboxValueToBoolean,
	date,
	falsyToNull,
	id,
	processMany,
	removeDuplicates,
	safeJSONParse,
	toArray,
} from "~/utils/zod";
import { CALENDAR_EVENT, REG_CLOSES_AT_OPTIONS } from "./calendar-constants";
import { calendarEventMaxDate, calendarEventMinDate } from "./calendar-utils";

const calendarEventTagSchema = z
	.string()
	.refine((val) =>
		CALENDAR_EVENT.PERSISTED_TAGS.includes(val as PersistedCalendarEventTag),
	);

export const calendarFiltersSchema = z.object({
	// startTime
	tagsIncluded: z.array(calendarEventTagSchema).nullish(),
	tagsExcluded: z.array(calendarEventTagSchema).nullish(),
	onlySendouHosted: z.boolean().nullish(),
	// orgsExcluded
	// games... S1/S2/S3
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

export const newCalendarEventActionSchema = z
	.object({
		eventToEditId: z.preprocess(actualNumber, id.nullish()),
		tournamentToCopyId: z.preprocess(actualNumber, id.nullish()),
		organizationId: z.preprocess(actualNumber, id.nullish()),
		name: z
			.string()
			.min(CALENDAR_EVENT.NAME_MIN_LENGTH)
			.max(CALENDAR_EVENT.NAME_MAX_LENGTH),
		description: z.preprocess(
			falsyToNull,
			z.string().max(CALENDAR_EVENT.DESCRIPTION_MAX_LENGTH).nullable(),
		),
		rules: z.preprocess(
			falsyToNull,
			z.string().max(CALENDAR_EVENT.RULES_MAX_LENGTH).nullable(),
		),
		date: z.preprocess(
			toArray,
			z
				.array(
					z.preprocess(
						date,
						z.date().min(calendarEventMinDate()).max(calendarEventMaxDate()),
					),
				)
				.min(1)
				.max(CALENDAR_EVENT.MAX_AMOUNT_OF_DATES),
		),
		bracketUrl: z
			.string()
			.url()
			.max(CALENDAR_EVENT.BRACKET_URL_MAX_LENGTH)
			.default("https://sendou.ink"),
		discordInviteCode: z.preprocess(
			falsyToNull,
			z.string().max(CALENDAR_EVENT.DISCORD_INVITE_CODE_MAX_LENGTH).nullable(),
		),
		tags: z.preprocess(
			processMany(safeJSONParse, removeDuplicates),
			z.array(calendarEventTagSchema).nullable(),
		),
		badges: z.preprocess(
			processMany(safeJSONParse, removeDuplicates),
			z.array(id).nullable(),
		),
		avatarImgId: id.nullish(),
		pool: z.string().optional(),
		toToolsEnabled: z.preprocess(checkboxValueToBoolean, z.boolean()),
		toToolsMode: z.enum(["ALL", "TO", "SZ", "TC", "RM", "CB"]).optional(),
		isRanked: z.preprocess(checkboxValueToBoolean, z.boolean().nullish()),
		isTest: z.preprocess(checkboxValueToBoolean, z.boolean().nullish()),
		regClosesAt: z.enum(REG_CLOSES_AT_OPTIONS).nullish(),
		enableNoScreenToggle: z.preprocess(
			checkboxValueToBoolean,
			z.boolean().nullish(),
		),
		enableSubs: z.preprocess(checkboxValueToBoolean, z.boolean().nullish()),
		autonomousSubs: z.preprocess(checkboxValueToBoolean, z.boolean().nullish()),
		strictDeadline: z.preprocess(checkboxValueToBoolean, z.boolean().nullish()),
		isInvitational: z.preprocess(checkboxValueToBoolean, z.boolean().nullish()),
		requireInGameNames: z.preprocess(
			checkboxValueToBoolean,
			z.boolean().nullish(),
		),
		minMembersPerTeam: z.coerce.number().int().min(1).max(4).nullish(),
		bracketProgression: bracketProgressionSchema.nullish(),
	})
	.refine(
		async (schema) => {
			if (schema.eventToEditId) {
				const eventToEdit = await CalendarRepository.findById({
					id: schema.eventToEditId,
				});
				return schema.date.length === 1 || !eventToEdit?.tournamentId;
			}
			return schema.date.length === 1 || !schema.toToolsEnabled;
		},
		{
			message: "Tournament must have exactly one date",
		},
	)
	.refine(
		(schema) => {
			if (schema.toToolsMode !== "ALL") {
				return true;
			}

			const maps = schema.pool ? MapPool.toDbList(schema.pool) : [];

			return (
				maps.length === 4 &&
				rankedModesShort.every((mode) => maps.some((map) => map.mode === mode))
			);
		},
		{
			message:
				'Map pool must contain a map for each ranked mode if using "Prepicked by teams - All modes"',
		},
	);
