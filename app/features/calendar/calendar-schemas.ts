import { z } from "zod";
import { type CalendarEventTag, TOURNAMENT_STAGE_TYPES } from "~/db/tables";
import {
	TIER_NUMBERS,
	tierNumberToName,
} from "~/features/tournament/core/tiering";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import * as Swiss from "~/features/tournament-bracket/core/Swiss";
import {
	array,
	checkboxGroup,
	dualSelectOptional,
	numberFieldOptional,
	radioGroup,
	textFieldOptional,
	toggle,
	userSearchOptional,
} from "~/form/fields";
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
import { CALENDAR_EVENT, CALENDAR_EVENT_RESULT } from "./calendar-constants";
import * as CalendarEvent from "./core/CalendarEvent";

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

const tierItems = TIER_NUMBERS.map((tier) => ({
	label: () => tierNumberToName(tier),
	value: String(tier),
}));

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
	tiers: z
		.tuple([
			z.coerce.number().int().min(1).max(9).nullable(),
			z.coerce.number().int().min(1).max(9).nullable(),
		])
		.catch([null, null]),
});

const TAGS_TO_OMIT: CalendarEventTag[] = [
	"CARDS",
	"SR",
	"S1",
	"S2",
	"SZ",
	"TW",
	"ONES",
	"DUOS",
	"TRIOS",
];

const filterTags = CALENDAR_EVENT.TAGS.filter(
	(tag) => !TAGS_TO_OMIT.includes(tag),
);

const tagItems = filterTags.map((tag) => ({
	label: `options.tag.${tag}` as const,
	value: tag,
}));

export const calendarFiltersFormSchema = z
	.object({
		modes: checkboxGroup({
			label: "labels.buildModes",
			items: [
				{ label: "modes.TW", value: "TW" },
				{ label: "modes.SZ", value: "SZ" },
				{ label: "modes.TC", value: "TC" },
				{ label: "modes.RM", value: "RM" },
				{ label: "modes.CB", value: "CB" },
				{ label: () => "Salmon Run", value: "SR" },
				{ label: () => "Tricolor", value: "TB" },
			],
			minLength: 1,
		}),
		modesExact: toggle({
			label: "labels.modesExact",
			bottomText: "bottomTexts.modesExact",
		}),
		games: checkboxGroup({
			label: "labels.games",
			items: [
				{ label: "options.game.S1", value: "S1" },
				{ label: "options.game.S2", value: "S2" },
				{ label: "options.game.S3", value: "S3" },
			],
			minLength: 1,
		}),
		preferredVersus: checkboxGroup({
			label: "labels.vs",
			items: [
				{ label: () => "4v4", value: "4v4" },
				{ label: () => "3v3", value: "3v3" },
				{ label: () => "2v2", value: "2v2" },
				{ label: () => "1v1", value: "1v1" },
			],
			minLength: 1,
		}),
		preferredStartTime: radioGroup({
			label: "labels.startTime",
			items: [
				{ label: "options.startTime.any", value: "ANY" },
				{ label: "options.startTime.eu", value: "EU" },
				{ label: "options.startTime.na", value: "NA" },
				{ label: "options.startTime.au", value: "AU" },
			],
		}),
		tagsIncluded: checkboxGroup({
			label: "labels.tagsIncluded",
			items: tagItems,
		}),
		tagsExcluded: checkboxGroup({
			label: "labels.tagsExcluded",
			items: tagItems,
		}),
		isSendou: toggle({ label: "labels.onlySendouEvents" }),
		isRanked: toggle({ label: "labels.onlyRankedEvents" }),
		minTeamCount: numberFieldOptional({
			label: "labels.minTeamCount",
		}),
		tiers: dualSelectOptional({
			fields: [
				{
					label: "labels.maxTier",
					items: tierItems,
				},
				{
					label: "labels.minTier",
					items: tierItems,
				},
			],
		}),
		orgsIncluded: array({
			label: "labels.orgsIncluded",
			field: textFieldOptional({ maxLength: 100 }),
			max: 10,
		}),
		orgsExcluded: array({
			label: "labels.orgsExcluded",
			field: textFieldOptional({ maxLength: 100 }),
			max: 10,
		}),
		authorIdsExcluded: array({
			label: "labels.authorIdsExcluded",
			field: userSearchOptional({}),
			max: 10,
		}),
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
export const calendarFiltersSearchParamsObject = z.object({
	filters: z
		.preprocess(safeJSONParse, calendarFiltersSearchParamsSchema)
		.catch(CalendarEvent.defaultFilters()),
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
				settings: z
					.object({
						thirdPlaceMatch: z.boolean().optional(),
						teamsPerGroup: z.number().int().optional(),
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
