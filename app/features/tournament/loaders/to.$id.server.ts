import { isAfter, subDays } from "date-fns";
import type { LoaderFunctionArgs } from "react-router";
import { getUser } from "~/features/auth/core/user.server";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import {
	LEAGUES,
	TOURNAMENT,
} from "~/features/tournament/tournament-constants";
import {
	bracketsMetaCached,
	requireTournamentVisible,
	type TournamentLayoutData,
	tournamentDataCached,
} from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentMatchVodRepository from "~/features/tournament-bracket/TournamentMatchVodRepository.server";
import { hasPermission } from "~/modules/permissions/utils";
import { databaseTimestampToDate } from "~/utils/dates";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/schema";
import { serializeTournamentLoaderData } from "../core/layout-payload";

export type TournamentLoaderData = {
	tournament: TournamentLayoutData;
	/** Count for the streams tab badge; the streams view loads the actual streams itself. */
	streamsCount: number;
	hasChildTournaments: boolean;
	friendCodes:
		| Awaited<
				ReturnType<typeof TournamentRepository.findFriendCodesByTournamentId>
		  >
		| undefined;
	preparedMaps:
		| Awaited<ReturnType<typeof TournamentRepository.findPreparedMapsById>>
		| undefined;
	vods: TournamentMatchVodRepository.VodsByTournamentId | undefined;
};

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({
		params,
		schema: idObject,
	});

	const tournament = await tournamentDataCached(tournamentId);
	requireTournamentVisible({ ctx: tournament.ctx, user });

	const friendCodeVisibilityDays = tournament.ctx.parentTournamentId ? 120 : 30;
	const tournamentStartedRecently = isAfter(
		databaseTimestampToDate(tournament.ctx.startsAt),
		subDays(new Date(), friendCodeVisibilityDays),
	);
	const showFriendCodes =
		tournamentStartedRecently &&
		hasPermission(tournament.ctx, "ORGANIZE", user);

	const isLeagueSignup = Object.values(LEAGUES)
		.flat()
		.some((entry) => entry.tournamentId === tournamentId);
	const hasChildTournaments = isLeagueSignup
		? await TournamentRepository.hasChildTournaments(tournamentId)
		: false;

	const showVods =
		tournament.ctx.isFinalized &&
		isAfter(
			databaseTimestampToDate(tournament.ctx.startsAt),
			subDays(new Date(), TOURNAMENT.VOD_VISIBILITY_DAYS),
		);

	return serializeTournamentLoaderData({
		tournament: {
			ctx: tournament.ctx,
			bracketsMeta: await bracketsMetaCached(tournamentId),
		},
		streamsCount: tournament.streams.length,
		hasChildTournaments,
		friendCodes: showFriendCodes
			? await TournamentRepository.findFriendCodesByTournamentId(tournamentId)
			: undefined,
		preparedMaps:
			hasPermission(tournament.ctx, "ORGANIZE", user) &&
			!tournament.ctx.isFinalized
				? await TournamentRepository.findPreparedMapsById(tournamentId)
				: undefined,
		vods: showVods
			? await TournamentMatchVodRepository.findVodsByTournamentId(tournamentId)
			: undefined,
	});
};
