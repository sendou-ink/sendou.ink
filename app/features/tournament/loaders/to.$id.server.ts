import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export type TournamentLoaderData = {
	tournament: Awaited<ReturnType<typeof tournamentDataCached>>;
	streamingParticipants: number[];
	streamsCount: number;
	friendCodes:
		| Awaited<ReturnType<typeof TournamentRepository.friendCodesByTournamentId>>
		| undefined;
	preparedMaps:
		| Awaited<ReturnType<typeof TournamentRepository.findPreparedMapsById>>
		| undefined;
};

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = await tournamentDataCached({ tournamentId, user });

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
	if (tournament.ctx.settings.isDraft && !isTournamentOrganizer) {
		throw new Response(null, { status: 404 });
	}

	const showFriendCodes = tournamentStartedInTheLastMonth && isTournamentAdmin;

	// skip expensive rr7 data serialization (hot path loader)
	return JSON.stringify({
		tournament,
		friendCodes: showFriendCodes
			? await TournamentRepository.friendCodesByTournamentId(tournamentId)
			: undefined,
		preparedMaps:
			isTournamentOrganizer && !tournament.ctx.isFinalized
				? await TournamentRepository.findPreparedMapsById(tournamentId)
				: undefined,
	});
};
