import { isAfter, subDays } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { LEAGUES } from "~/features/tournament/tournament-constants";
import { tournamentDataCached } from "~/features/tournament-bracket/core/Tournament.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";

export type TournamentLoaderData = {
	tournament: Awaited<ReturnType<typeof tournamentDataCached>>;
	streamingParticipants: number[];
	streamsCount: number;
	hasChildTournaments: boolean;
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

	const friendCodeVisibilityDays = tournament.ctx.parentTournamentId ? 120 : 30;
	const tournamentStartedRecently = isAfter(
		databaseTimestampToDate(tournament.ctx.startTime),
		subDays(new Date(), friendCodeVisibilityDays),
	);
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

	const showFriendCodes = tournamentStartedRecently && isTournamentAdmin;

	const isLeagueSignup = Object.values(LEAGUES)
		.flat()
		.some((entry) => entry.tournamentId === tournamentId);
	const hasChildTournaments = isLeagueSignup
		? await TournamentRepository.hasChildTournaments(tournamentId)
		: false;

	// skip expensive rr7 data serialization (hot path loader)
	return JSON.stringify({
		tournament,
		hasChildTournaments,
		friendCodes: showFriendCodes
			? await TournamentRepository.friendCodesByTournamentId(tournamentId)
			: undefined,
		preparedMaps:
			isTournamentOrganizer && !tournament.ctx.isFinalized
				? await TournamentRepository.findPreparedMapsById(tournamentId)
				: undefined,
	});
};
