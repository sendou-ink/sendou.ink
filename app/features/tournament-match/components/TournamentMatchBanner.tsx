import { differenceInMinutes } from "date-fns";
import { Lock, MousePointerClick, Users, X } from "lucide-react";
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
import {
	isLeagueRoundLocked,
	resolveLeagueRoundStartDate,
} from "~/features/tournament/tournament-utils";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import { tournamentTeamToActiveRosterUserIds } from "~/features/tournament-bracket/tournament-bracket-utils";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { databaseTimestampToDate } from "~/utils/dates";
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

	const leagueRoundLocked = isLeagueRoundLocked(tournament, data.match.roundId);
	const leagueRoundStartDate = leagueRoundLocked
		? resolveLeagueRoundStartDate(tournament, data.match.roundId)
		: null;

	const pickBanBanner = resolvePickBanBanner(data, tournament, t);

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
			{leagueRoundLocked ? (
				<IconBanner
					icon={<Lock size={32} />}
					header={t("tournament:match.leagueLocked.header")}
					subtitle={
						leagueRoundStartDate
							? t("tournament:match.leagueLocked.subtitle", {
									date: leagueRoundStartDate.toLocaleDateString(),
								})
							: undefined
					}
				/>
			) : teamsMissingActiveRoster.length > 0 ? (
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
			) : pickBanBanner ? (
				<IconBanner
					icon={pickBanBanner.icon}
					header={pickBanBanner.header}
					subtitle={pickBanBanner.subtitle}
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
	const tournament = useTournament();
	const currentTime = useAutoRerender("ten seconds");

	if (
		!data.match.startedAt ||
		!data.match.opponentOne ||
		!data.match.opponentTwo
	)
		return null;

	const totalMinutes = differenceInMinutes(
		currentTime,
		databaseTimestampToDate(data.match.startedAt),
	);

	const currentMinutes = resolveCurrentMinutes({
		data,
		tournament,
		currentTime,
	});

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
			time={
				data.matchIsOver
					? undefined
					: {
							currentMinutes,
							totalMinutes,
						}
			}
		/>
	);
}

function resolveCurrentMinutes({
	data,
	tournament,
	currentTime,
}: {
	data: TournamentMatchLoaderData;
	tournament: ReturnType<typeof useTournament>;
	currentTime: Date;
}): number {
	const opponentOneId = data.match.opponentOne?.id;
	const opponentTwoId = data.match.opponentTwo?.id;
	if (!opponentOneId || !opponentTwoId) return 0;
	if (!data.match.roundMaps?.pickBan) return 0;

	const teamOne = tournament.teamById(opponentOneId);
	const teamTwo = tournament.teamById(opponentTwoId);
	if (!teamOne || !teamTwo) return 0;

	const teams: [PickBan.PickBanTeam, PickBan.PickBanTeam] = [
		{ id: teamOne.id, seed: teamOne.seed },
		{ id: teamTwo.id, seed: teamTwo.seed },
	];

	const currentTurn = PickBan.turnOf({
		results: data.results,
		maps: data.match.roundMaps,
		teams,
		mapList: data.mapList,
		pickBanEventCount: data.pickBanEventCount,
	});
	if (!currentTurn) return 0;

	const sessionStart = PickBan.currentTurnSessionStartedAt({
		currentTurn,
		events: data.pickBanEvents,
		results: data.results,
		matchStartedAt: data.match.startedAt,
		maps: data.match.roundMaps,
		teams,
	});
	if (sessionStart == null) return 0;

	return Math.max(
		0,
		differenceInMinutes(currentTime, databaseTimestampToDate(sessionStart)),
	);
}

function resolvePickBanBanner(
	data: TournamentMatchLoaderData,
	tournament: ReturnType<typeof useTournament>,
	t: ReturnType<typeof useTranslation<["tournament"]>>["t"],
): { icon: React.ReactNode; header: string; subtitle: string } | null {
	if (data.matchIsOver) return null;
	if (!data.match.roundMaps?.pickBan) return null;

	const opponentOneId = data.match.opponentOne?.id;
	const opponentTwoId = data.match.opponentTwo?.id;
	if (!opponentOneId || !opponentTwoId) return null;

	const teamOne = tournament.teamById(opponentOneId);
	const teamTwo = tournament.teamById(opponentTwoId);
	if (!teamOne || !teamTwo) return null;

	const turnOfResult = PickBan.turnOf({
		results: data.results,
		maps: data.match.roundMaps,
		teams: [
			{ id: teamOne.id, seed: teamOne.seed },
			{ id: teamTwo.id, seed: teamTwo.seed },
		],
		mapList: data.mapList,
		pickBanEventCount: data.pickBanEventCount,
	});
	if (!turnOfResult) return null;

	const pickingTeam = turnOfResult.teamId === teamOne.id ? teamOne : teamTwo;

	const isCustom = data.match.roundMaps.pickBan === "CUSTOM";
	const isCounterpick =
		data.match.roundMaps.pickBan === "COUNTERPICK" ||
		data.match.roundMaps.pickBan === "COUNTERPICK_MODE_REPEAT_OK";

	const stepCounter =
		isCustom && turnOfResult.stepTotal && turnOfResult.stepTotal > 1
			? ` (${turnOfResult.stepCurrent}/${turnOfResult.stepTotal})`
			: "";

	const header = (() => {
		if (isCounterpick) return t("tournament:pickBan.counterpick");
		switch (turnOfResult.action) {
			case "PICK":
				return t("tournament:pickBan.pickMap") + stepCounter;
			case "BAN":
				return t("tournament:pickBan.banMap") + stepCounter;
			case "MODE_PICK":
				return t("tournament:pickBan.pickMode") + stepCounter;
			case "MODE_BAN":
				return t("tournament:pickBan.banMode") + stepCounter;
			default:
				return "";
		}
	})();

	if (!header) return null;

	const isBan =
		turnOfResult.action === "BAN" || turnOfResult.action === "MODE_BAN";

	return {
		icon: isBan ? <X size={32} /> : <MousePointerClick size={32} />,
		header,
		subtitle: t("tournament:pickBan.waitingFor", {
			teamName: pickingTeam.name,
		}),
	};
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
