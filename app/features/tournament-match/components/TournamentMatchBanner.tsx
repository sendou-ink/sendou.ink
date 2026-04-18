import { differenceInMinutes } from "date-fns";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
	IconBanner,
	MatchBanner,
	MatchBannerContainer,
	MultiMatchBanner,
} from "~/components/match-page/MatchBanner";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { tournamentTeamToActiveRosterUserIds } from "~/features/tournament-bracket/tournament-bracket-utils";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";

export function TournamentMatchBanner({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();

	const opponentOne = data.match.opponentOne;
	const opponentTwo = data.match.opponentTwo;

	const scoreSum = (opponentOne?.score ?? 0) + (opponentTwo?.score ?? 0);

	const currentMap = data.mapList?.filter((m) => !m.bannedByTournamentTeamId)[
		scoreSum
	];

	const teamsMissingActiveRoster = resolveTeamsMissingActiveRoster(
		data,
		tournament,
	);

	const activeRosterByTeamId = (tournamentTeamId: number) => {
		const team = tournament.teamById(tournamentTeamId);
		if (!team) return null;

		const activeRosterUserIds = team.activeRosterUserIds;
		if (!activeRosterUserIds?.length) return null;

		return team.members
			.filter((member) => activeRosterUserIds.includes(member.userId))
			.map((member) => ({ ...member, id: member.userId }));
	};

	return (
		<MatchBannerContainer>
			<TournamentMatchBannerTopRow data={data} />
			{teamsMissingActiveRoster.length > 0 ? (
				<IconBanner
					icon={<Users size={32} />}
					header={t("tournament:match.activeRosterMissing.header")}
					subtitle={t("tournament:match.activeRosterMissing.subtitle", {
						teams: teamsMissingActiveRoster.join(" & "),
					})}
				/>
			) : data.matchIsOver ? (
				<MultiMatchBanner
					stageIds={data.results.map((result) => result.stageId)}
				/>
			) : currentMap ? (
				<MatchBanner
					stageId={currentMap.stageId}
					mode={currentMap.mode}
					screenLegal={!data.noScreen}
				>
					Team 2 pick
				</MatchBanner>
			) : null}
			<MatchBannerBottomRow
				games={
					data.mapList?.map((map, i) => {
						const result = data.results.at(i);
						const winner = result
							? result.winnerTeamId === opponentOne?.id
								? "ALPHA"
								: "BRAVO"
							: undefined;

						return {
							mode: map.mode,
							winner,
						};
					}) ?? []
				}
				activeRosters={
					opponentOne?.id && opponentTwo?.id
						? {
								alpha: activeRosterByTeamId(opponentOne.id),
								bravo: activeRosterByTeamId(opponentTwo.id),
							}
						: null
				}
			/>
		</MatchBannerContainer>
	);
}

function TournamentMatchBannerTopRow({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
	const currentTime = new Date();

	if (
		!data.match.startedAt ||
		!data.match.opponentOne ||
		!data.match.opponentTwo
	)
		return null;

	const totalMinutes = differenceInMinutes(currentTime, data.match.startedAt);

	return (
		<MatchBannerTopRow
			score={{
				alpha: data.match.opponentOne.score ?? 0,
				bravo: data.match.opponentTwo.score ?? 0,
				isFinal:
					data.match.opponentOne?.result === "win" ||
					data.match.opponentTwo?.result === "win",
				count: data.match.roundMaps.count,
				bestOf: data.match.roundMaps.type === "BEST_OF",
			}}
			time={{
				// xxx: current
				currentMinutes: 3,
				totalMinutes,
			}}
		/>
	);
}

function resolveTeamsMissingActiveRoster(
	data: TournamentMatchLoaderData,
	tournament: ReturnType<typeof useTournament>,
): string[] {
	const opponentOneId = data.match.opponentOne?.id;
	const opponentTwoId = data.match.opponentTwo?.id;
	if (!opponentOneId || !opponentTwoId) return [];

	return [opponentOneId, opponentTwoId]
		.map((id) => tournament.teamById(id))
		.filter((team) => team != null)
		.filter(
			(team) =>
				!tournamentTeamToActiveRosterUserIds(
					team,
					tournament.minMembersPerTeam,
				),
		)
		.map((team) => team.name);
}
