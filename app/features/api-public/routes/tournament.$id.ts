import type { LoaderFunctionArgs } from "react-router";
import * as v from "valibot";
import { db } from "~/db/sql";
import { databaseTimestampToDate } from "~/utils/dates";
import { jsonArrayFrom } from "~/utils/kysely.server";
import { notFoundIfNullish, parseParams } from "~/utils/remix.server";
import { id } from "~/utils/schema";
import type { GetTournamentResponse } from "../schema";

const paramsSchema = v.object({
	id,
});

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const { id } = parseParams({ params, schema: paramsSchema });

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
						.where("TournamentResult.tournamentId", "=", id)
						.select("TournamentResult.tournamentId"),
				).as("isFinalized"),
				eb
					.selectFrom("UserSubmittedImage")
					.select(["UserSubmittedImage.url"])
					.whereRef("CalendarEvent.avatarImgId", "=", "UserSubmittedImage.id")
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
						.where("TournamentTeam.tournamentId", "=", id)
						.where("TournamentTeam.isPlaceholder", "=", 0),
				).as("teams"),
			])
			.where("Tournament.id", "=", id)
			.executeTakeFirst(),
	);

	const result: GetTournamentResponse = {
		name: tournament.name,
		startTime: databaseTimestampToDate(tournament.startsAt).toISOString(),
		url: `https://sendou.ink/to/${id}/brackets`,
		logoUrl: tournament.logoUrl,
		teams: {
			checkedInCount: tournament.teams.filter((team) => team.checkedInAt)
				.length,
			registeredCount: tournament.teams.length,
		},
		brackets: tournament.settings.bracketProgression.map((bp) => ({
			name: bp.name,
			type: bp.type,
		})),
		organizationId: tournament.organizationId,
		isFinalized: Boolean(tournament.isFinalized),
	};

	return Response.json(result);
};
