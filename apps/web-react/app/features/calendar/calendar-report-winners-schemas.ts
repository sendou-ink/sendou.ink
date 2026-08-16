import { z } from "zod";
import {
	array,
	customField,
	fieldset,
	numberField,
	textField,
} from "~/form/fields";
import { id } from "~/utils/zod";
import { CALENDAR_EVENT_RESULT } from "./calendar-constants";

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
