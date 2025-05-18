import type { LoaderFunctionArgs, SerializeFrom } from "@remix-run/node";
import { getUser } from "~/features/auth/core/user.server";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import { streamsByTournamentId } from "../core/streams.server";

export type TournamentLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = await tournamentDataCached({ tournamentId, user });

	const streams =
		tournament.data.stage.length > 0 && !tournament.ctx.isFinalized
			? await streamsByTournamentId(tournament.ctx)
			: [];

	const tournamentStartedInTheLastMonth =
		databaseTimestampToDate(tournament.ctx.startTime) >
		new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	const isTournamentAdmin =
		tournament.ctx.author.id === user?.id ||
		tournament.ctx.staff.some(
			(s) => s.role === "ORGANIZER" && s.id === user?.id,
		) ||
		user?.roles.includes("ADMIN") ||
		tournament.ctx.organization?.members.some(
			(m) => m.userId === user?.id && m.role === "ADMIN",
		);
	const isTournamentOrganizer =
		isTournamentAdmin ||
		tournament.ctx.staff.some(
			(s) => s.role === "ORGANIZER" && s.id === user?.id,
		) ||
		tournament.ctx.organization?.members.some(
			(m) => m.userId === user?.id && m.role === "ORGANIZER",
		);
	const showFriendCodes = tournamentStartedInTheLastMonth && isTournamentAdmin;

	return {
		tournament,
		streamingParticipants: streams.flatMap((s) => (s.userId ? [s.userId] : [])),
		streamsCount: streams.length,
		friendCodes: showFriendCodes
			? await TournamentRepository.friendCodesByTournamentId(tournamentId)
			: undefined,
		preparedMaps:
			isTournamentOrganizer && !tournament.ctx.isFinalized
				? await TournamentRepository.findPreparedMapsById(tournamentId)
				: undefined,
	};
};
