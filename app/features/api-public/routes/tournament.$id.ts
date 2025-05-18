import { type LoaderFunctionArgs, json } from "@remix-run/node";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { cors } from "remix-utils/cors";
import { z } from "zod";
import { db } from "~/db/sql";
import { HACKY_resolvePicture } from "~/features/tournament/tournament-utils";
import { databaseTimestampToDate } from "~/utils/dates";
import { notFoundIfFalsy, parseParams } from "~/utils/remix.server";
import { userSubmittedImage } from "~/utils/urls";
import { id } from "~/utils/zod";
import {
	handleOptionsRequest,
	requireBearerAuth,
} from "../api-public-utils.server";
import type { GetTournamentResponse } from "../schema";

const paramsSchema = z.object({
	id,
});

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	await handleOptionsRequest(request);
	requireBearerAuth(request);

	const { id } = parseParams({ params, schema: paramsSchema });

	const tournament = notFoundIfFalsy(
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
				"CalendarEventDate.startTime",
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
						.where("TournamentTeam.tournamentId", "=", id),
				).as("teams"),
			])
			.where("Tournament.id", "=", id)
			.executeTakeFirst(),
	);

	const result: GetTournamentResponse = {
		name: tournament.name,
		startTime: databaseTimestampToDate(tournament.startTime).toISOString(),
		url: `https://sendou.ink/to/${id}/brackets`,
		logoUrl: tournament.logoUrl
			? userSubmittedImage(tournament.logoUrl)
			: `https://sendou.ink${HACKY_resolvePicture(tournament)}`,
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

	return await cors(request, json(result));
};
