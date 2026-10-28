import type { LoaderFunctionArgs } from "react-router";
import { db } from "~/db/sql";
import { databaseTimestampToDate } from "~/utils/dates";
import {
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
} from "~/utils/kysely.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import type { GetTournamentResponse } from "../schema";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = notFoundIfNullish(
		await db
			.selectFrom("Tournament")
			.innerJoin("CalendarEvent", "CalendarEvent.tournamentId", "Tournament.id")
			.innerJoin(
				"CalendarEventDate",
				"CalendarEventDate.eventId",
				"CalendarEvent.id",
			)
			.select(({ eb, exists, selectFrom }) => [
				"CalendarEvent.name",
				"CalendarEvent.organizationId",
				"CalendarEventDate.startsAt",
				"Tournament.settings",
				exists(
					selectFrom("TournamentResult")
						.where("TournamentResult.tournamentId", "=", tournamentId)
						.select("TournamentResult.tournamentId"),
				).as("isFinalized"),
				concatUserSubmittedImagePrefix(
					eb
						.selectFrom("UserSubmittedImage")
						.select("UserSubmittedImage.url")
						.whereRef("CalendarEvent.avatarImgId", "=", "UserSubmittedImage.id")
						.$asScalar(),
				)
					.$castTo<string | null>()
					.as("logoUrl"),
				jsonArrayFrom(
					eb
						.selectFrom("TournamentTeam")
						.leftJoin("TournamentTeamCheckIn", (join) =>
							join
								.onRef(
									"TournamentTeam.id",
									"=",
									"TournamentTeamCheckIn.tournamentTeamId",
								)
								.on("TournamentTeamCheckIn.bracketIdx", "is", null),
						)
						.select(["TournamentTeamCheckIn.checkedInAt"])
						.where("TournamentTeam.tournamentId", "=", tournamentId)
						.where("TournamentTeam.isPlaceholder", "=", 0),
				).as("teams"),
			])
			.where("Tournament.id", "=", tournamentId)
			.executeTakeFirst(),
	);

	const result: GetTournamentResponse = {
		name: tournament.name,
		startTime: databaseTimestampToDate(tournament.startsAt).toISOString(),
		url: `https://sendou.ink/to/${tournamentId}/brackets`,
		logoUrl: tournament.logoUrl,
		teams: {
			checkedInCount: tournament.teams.filter((team) => team.checkedInAt)
				.length,
			registeredCount: tournament.teams.length,
		},
		brackets: tournament.settings.bracketProgression.map((bp) => ({
			name: bp.name,
			type: bp.type,
			sources: bp.sources?.map((source) => ({
				bracketIdx: source.bracketIdx,
				placements: source.placements,
				rest: source.rest,
			})),
			startTime: bp.startTime
				? databaseTimestampToDate(bp.startTime).toISOString()
				: undefined,
			requiresCheckIn: bp.requiresCheckIn,
		})),
		organizationId: tournament.organizationId,
		isFinalized: Boolean(tournament.isFinalized),
	};

	return Response.json(result);
};
