import clsx from "clsx";
import { Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import type { CommonUser } from "~/utils/kysely.server";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { isSetOverByScore } from "../tournament-match-utils";

export function TournamentMatchActionTab({
	data,
	currentMap,
	ownTeamId,
}: {
	data: TournamentMatchLoaderData;
	currentMap: { stageId: StageId; mode: ModeShort };
	ownTeamId: number;
}) {
	const { t } = useTranslation(["q"]);
	const tournament = useTournament();
	const reportFetcher = useFetcher();
	const undoFetcher = useFetcher();

	const opponentOneId = data.match.opponentOne!.id!;
	const opponentTwoId = data.match.opponentTwo!.id!;

	const scores: [number, number] = [
		data.match.opponentOne?.score ?? 0,
		data.match.opponentTwo?.score ?? 0,
	];
	const scoreSum = scores[0] + scores[1];

	const teamOne = tournament.teamById(opponentOneId)!;
	const teamTwo = tournament.teamById(opponentTwoId)!;

	const withPoints = tournament.bracketByIdxOrDefault(
		tournament.matchIdToBracketIdx(data.match.id) ?? 0,
	).collectResultsWithPoints;

	const count = data.match.roundMaps.count;
	const countType = data.match.roundMaps.type;

	const setEndingTeamIds: number[] = [];
	if (
		isSetOverByScore({
			scores: [scores[0] + 1, scores[1]],
			count,
			countType,
		})
	) {
		setEndingTeamIds.push(teamOne.id);
	}
	if (
		isSetOverByScore({
			scores: [scores[0], scores[1] + 1],
			count,
			countType,
		})
	) {
		setEndingTeamIds.push(teamTwo.id);
	}

	const setEnding =
		setEndingTeamIds.length > 0
			? {
					...buildSetEndingData({
						teams: [teamOne, teamTwo],
						scores,
						results: data.results,
						opponentOneId,
					}),
					setEndingTeamIds,
				}
			: undefined;

	return (
		<MatchActionTab
			key={scoreSum}
			teams={[
				{
					id: teamOne.id,
					name: teamOne.name,
					avatar: teamOne.pickupAvatarUrl ?? undefined,
				},
				{
					id: teamTwo.id,
					name: teamTwo.name,
					avatar: teamTwo.pickupAvatarUrl ?? undefined,
				},
			]}
			ownTeamId={ownTeamId}
			stageId={currentMap.stageId}
			mode={currentMap.mode}
			withPoints={withPoints}
			setEnding={setEnding}
			isSubmitting={reportFetcher.state !== "idle"}
			onSubmit={({ winnerId, points }) => {
				reportFetcher.submit(
					{
						_action: "REPORT_SCORE",
						winnerTeamId: String(winnerId),
						position: String(scoreSum),
						...(points ? { points: JSON.stringify(points) } : {}),
					},
					{ method: "post" },
				);
			}}
			actionButtons={
				<SendouButton
					variant="minimal-destructive"
					size="miniscule"
					icon={<Undo2 size={16} />}
					isPending={undoFetcher.state !== "idle"}
					className={clsx({ invisible: scoreSum === 0 })}
					onPress={() => {
						undoFetcher.submit(
							{
								_action: "UNDO_REPORT_SCORE",
								position: String(scoreSum - 1),
							},
							{ method: "post" },
						);
					}}
				>
					{t("q:match.undoReport")}
				</SendouButton>
			}
		/>
	);
}

function buildSetEndingData({
	teams,
	scores,
	results,
	opponentOneId,
}: {
	teams: [
		NonNullable<ReturnType<ReturnType<typeof useTournament>["teamById"]>>,
		NonNullable<ReturnType<ReturnType<typeof useTournament>["teamById"]>>,
	];
	scores: [number, number];
	results: TournamentMatchLoaderData["results"];
	opponentOneId: number;
}) {
	const [teamOne, teamTwo] = teams;

	const memberToCommonUser = (m: {
		userId: number;
		username: string;
		discordId: string;
		discordAvatar: string | null;
		customUrl: string | null;
	}): CommonUser => ({
		id: m.userId,
		username: m.username,
		discordId: m.discordId,
		discordAvatar: m.discordAvatar,
		customUrl: m.customUrl,
	});

	const teamOneMembersMap = new Map(
		teamOne.members.map((m) => [m.userId, memberToCommonUser(m)]),
	);
	const teamTwoMembersMap = new Map(
		teamTwo.members.map((m) => [m.userId, memberToCommonUser(m)]),
	);

	const previousMaps = results.map((result) => {
		const alphaParticipants: CommonUser[] = [];
		const bravoParticipants: CommonUser[] = [];

		for (const p of result.participants) {
			const user =
				teamOneMembersMap.get(p.userId) ?? teamTwoMembersMap.get(p.userId);
			if (!user) continue;

			if (p.tournamentTeamId === opponentOneId) {
				alphaParticipants.push(user);
			} else {
				bravoParticipants.push(user);
			}
		}

		return {
			stageId: result.stageId,
			mode: result.mode,
			timestamp: databaseTimestampToJavascriptTimestamp(result.createdAt),
			winner:
				result.winnerTeamId === opponentOneId
					? ("ALPHA" as const)
					: ("BRAVO" as const),
			rosters: {
				alpha: alphaParticipants,
				bravo: bravoParticipants,
			},
			points:
				result.opponentOnePoints != null && result.opponentTwoPoints != null
					? ([result.opponentOnePoints, result.opponentTwoPoints] as [
							number,
							number,
						])
					: undefined,
		};
	});

	const activeRosterUsers = (
		team: NonNullable<ReturnType<ReturnType<typeof useTournament>["teamById"]>>,
	): CommonUser[] => {
		const activeIds = team.activeRosterUserIds;
		const members = activeIds
			? team.members.filter((m) => activeIds.includes(m.userId))
			: team.members;
		return members.map(memberToCommonUser);
	};

	return {
		teams: {
			alpha: {
				name: teamOne.name,
				avatar: teamOne.pickupAvatarUrl ?? undefined,
			},
			bravo: {
				name: teamTwo.name,
				avatar: teamTwo.pickupAvatarUrl ?? undefined,
			},
		},
		score: { alpha: scores[0], bravo: scores[1] },
		maps: previousMaps,
		currentRosters: {
			alpha: activeRosterUsers(teamOne),
			bravo: activeRosterUsers(teamTwo),
		},
	};
}
