import { z } from "zod";
import * as CalendarRepository from "~/features/calendar/CalendarRepository.server";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import { rankedModesShort } from "~/modules/in-game-lists/modes";
import "~/styles/calendar-new.css";
import {
	bracketProgressionSchema,
	calendarEventTagSchema,
} from "~/features/calendar/calendar-schemas";
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
