import { z } from "zod";
import type { CalendarEventTag } from "~/features/calendar/calendar-types";
import {
	TOURNAMENT,
	TOURNAMENT_STAGE_TYPES,
} from "~/features/tournament/tournament-constants";
import * as Swiss from "~/features/tournament-bracket/core/engine/swiss/team-status";
import * as Progression from "~/features/tournament-bracket/core/Progression";
import {
	array,
	customField,
	fieldset,
	numberField,
	textField,
} from "~/form/fields";
import { gamesShort, versusShort } from "~/modules/in-game-lists/games";
import { modesShortWithSpecial } from "~/modules/in-game-lists/modes";
import {
	gamesShortSchema,
	id,
	modeShortWithSpecial,
	safeJSONParse,
} from "~/utils/zod";
import { CALENDAR_EVENT, CALENDAR_EVENT_RESULT } from "./calendar-constants";

const calendarEventTagSchema = z
	.string()
	.refine((val) => CALENDAR_EVENT.TAGS.includes(val as CalendarEventTag));

export const calendarFilterTagsArr = z
	.array(calendarEventTagSchema)
	.max(CALENDAR_EVENT.TAGS.length);

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
	tagsIncluded: calendarFilterTagsArr.catch([]),
	tagsExcluded: calendarFilterTagsArr.catch([]),
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

const TAGS_TO_OMIT: CalendarEventTag[] = [
	"CARDS",
	"SR",
	"S1",
	"S2",
	"ONES",
	"DUOS",
	"TRIOS",
];

export const calendarFilterTags = CALENDAR_EVENT.TAGS.filter(
	(tag) => !TAGS_TO_OMIT.includes(tag),
);

const reportedPlayerSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("USER"), id: id.nullable() }),
	z.object({
		type: z.literal("NAME"),
		name: z
			.string()
			.max(CALENDAR_EVENT_RESULT.MAX_PLAYER_NAME_LENGTH)
			.nullable(),
	}),
]);

export type ReportedPlayer = z.infer<typeof reportedPlayerSchema>;

export const EMPTY_REPORTED_PLAYER: ReportedPlayer = { type: "USER", id: null };

type StoredReportedPlayer = { userId: number | null; name: string | null };

const reportedPlayersSchema = z
	.array(reportedPlayerSchema)
	.max(CALENDAR_EVENT_RESULT.MAX_PLAYERS_LENGTH)
	.transform((players) =>
		players.flatMap((player): Array<StoredReportedPlayer> => {
			if (player.type === "USER") {
				return player.id === null ? [] : [{ userId: player.id, name: null }];
			}

			return player.name ? [{ userId: null, name: player.name }] : [];
		}),
	)
	.refine((players) => players.length > 0, {
		message: "forms:errors.emptyTeam",
	})
	.refine(
		(players) => {
			const userIds = players.flatMap((player) => player.userId ?? []);

			return userIds.length === new Set(userIds).size;
		},
		{ message: "forms:errors.duplicatePlayer" },
	);

const reportedTeamFieldset = fieldset({
	fields: z.object({
		teamName: textField({
			label: "labels.teamName",
			maxLength: CALENDAR_EVENT_RESULT.MAX_TEAM_NAME_LENGTH,
		}),
		placement: numberField({
			label: "labels.placement",
			maxLength: String(CALENDAR_EVENT_RESULT.MAX_TEAM_PLACEMENT).length,
		}),
		players: customField(
			{
				initialValue: new Array(
					CALENDAR_EVENT_RESULT.DEFAULT_PLAYERS_LENGTH,
				).fill(EMPTY_REPORTED_PLAYER),
			},
			reportedPlayersSchema,
		),
	}),
});

export const reportWinnersFormSchema = z
	.object({
		participantCount: numberField({
			label: "labels.participantCount",
			maxLength: String(CALENDAR_EVENT_RESULT.MAX_PARTICIPANTS_COUNT).length,
		}),
		teams: array({
			label: "labels.teams",
			min: 1,
			max: CALENDAR_EVENT_RESULT.MAX_TEAMS_COUNT,
			field: reportedTeamFieldset,
		}),
	})
	.superRefine((data, ctx) => {
		if (
			data.participantCount < 1 ||
			data.participantCount > CALENDAR_EVENT_RESULT.MAX_PARTICIPANTS_COUNT
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.numberOutOfRange",
				path: ["participantCount"],
			});
		}

		for (const [index, team] of data.teams.entries()) {
			if (
				team.placement < 1 ||
				team.placement > CALENDAR_EVENT_RESULT.MAX_TEAM_PLACEMENT
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: "forms:errors.numberOutOfRange",
					path: ["teams", index, "placement"],
				});
			}
		}

		const teamNames = data.teams.map((team) => team.teamName);
		if (teamNames.length !== new Set(teamNames).size) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.uniqueTeamName",
				path: ["teams"],
			});
		}
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
