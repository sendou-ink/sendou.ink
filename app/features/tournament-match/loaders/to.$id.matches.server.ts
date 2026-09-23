import { type LoaderFunctionArgs, redirect } from "react-router";
import * as R from "remeda";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentFromParams } from "~/features/tournament-bracket/core/Tournament.server";
import { tournamentBracketsPage } from "~/features/tournament-bracket/tournament-bracket-urls";
import { databaseTimestampNow } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import * as LeagueScheduling from "../core/LeagueScheduling";
import * as TournamentMatchRepository from "../TournamentMatchRepository.server";
import {
	ALL_DIVISIONS,
	tournamentMatchesSearchParams,
} from "../tournament-matches-search-params";

export type TournamentMatchesLoaderData = SerializeFrom<typeof loader>;

export type TournamentMatchesLoaderMatch =
	TournamentMatchesLoaderData["matches"][number];

/**
 * Every set of one league division, or of all of them, with where it is in the scheduling flow.
 * Without a division in the URL the viewer's own is shown, or the first one for anyone else.
 */
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const { tournament, tournamentId, user } = await tournamentFromParams(
		params,
		{ for: "view" },
	);

	if (!tournament.isLeague || !tournament.hasStarted) {
		throw redirect(tournamentBracketsPage({ tournamentId }));
	}

	const searchParams = tournamentMatchesSearchParams.parse(request);
	const ownTeam = tournament.teamMemberOfByUser(user);
	const divisionIdx =
		searchParams.division === ALL_DIVISIONS
			? null
			: resolveDivisionIdx({
					tournament,
					requested: searchParams.division,
					ownDivisionIdx: ownTeam ? (ownTeam.startingBracketIdx ?? 0) : null,
				});

	const lastResultAts = new Map(
		(
			await TournamentMatchRepository.findLastResultAtsByTournamentId(
				tournamentId,
			)
		).map((row) => [row.id, row.lastResultAt]),
	);
	const now = databaseTimestampNow();
	const streamingParticipantIds = tournament.streamingParticipantIds;
	const castedMatchIds = new Set(
		[
			...(tournament.ctx.castedMatchesInfo?.lockedMatches ?? []),
			...(tournament.ctx.castedMatchesInfo?.castedMatches ?? []),
		].map((cast) => cast.matchId),
	);

	const matches = tournament.brackets.flatMap((bracket, bracketIdx) => {
		if (bracket.preview) return [];
		if (
			divisionIdx !== null &&
			tournament.leagueDivisionOfBracket(bracketIdx) !== divisionIdx
		) {
			return [];
		}

		return bracket.data.match.flatMap((match) => {
			const teamOne = match.opponent1?.id
				? tournament.teamById(match.opponent1.id)
				: null;
			const teamTwo = match.opponent2?.id
				? tournament.teamById(match.opponent2.id)
				: null;
			if (!teamOne || !teamTwo) return [];

			const round = bracket.data.round.find((r) => r.id === match.roundId);
			const scheduledAt = match.scheduledAt ?? null;
			const members = [...teamOne.memberUserIds, ...teamTwo.memberUserIds];

			return [
				{
					id: match.id,
					bracketIdx,
					bracketName: bracket.name,
					roundName:
						tournament.matchContextNamesById(match.id)
							?.roundNameWithoutMatchIdentifier ?? "",
					roundNumber: round?.number ?? 0,
					teams: [teamOne, teamTwo].map((team) => ({
						id: team.id,
						name: team.name,
						logoUrl: team.logoUrl,
						score:
							(team.id === teamOne.id ? match.opponent1 : match.opponent2)
								?.score ?? 0,
					})),
					winnerTeamId:
						match.winnerSide === "opponent1"
							? teamOne.id
							: match.winnerSide === "opponent2"
								? teamTwo.id
								: null,
					scheduledAt,
					isSchedulable:
						LeagueScheduling.phase({
							isLeague: true,
							isOver: match.winnerSide !== null,
							hasBothTeams: true,
							isPlayableAt: round?.isPlayableAt ?? null,
							scheduledAt,
							now,
						}) === "UNSCHEDULED",
					lastResultAt: lastResultAts.get(match.id) ?? null,
					isCasted: castedMatchIds.has(match.id),
					isLive:
						scheduledAt !== null &&
						LeagueScheduling.isLive({
							scheduledAt,
							hasWinner: match.winnerSide !== null,
							now,
						}) &&
						members.some((userId) => streamingParticipantIds.includes(userId)),
					isOwn: ownTeam
						? teamOne.id === ownTeam.id || teamTwo.id === ownTeam.id
						: false,
				},
			];
		});
	});

	return {
		divisionIdx,
		matches: R.sortBy(
			matches,
			(match) => match.scheduledAt ?? Number.POSITIVE_INFINITY,
		),
	};
};

function resolveDivisionIdx({
	tournament,
	requested,
	ownDivisionIdx,
}: {
	tournament: Tournament;
	requested: number | null;
	ownDivisionIdx: number | null;
}) {
	const divisions = tournament.leagueDivisions;
	const isDivision = (idx: number | null) =>
		idx !== null && divisions.some((division) => division.idx === idx);

	if (isDivision(requested)) return requested;
	if (isDivision(ownDivisionIdx)) return ownDivisionIdx;

	return divisions[0]?.idx ?? 0;
}
