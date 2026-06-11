import { Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useMatchWeaponReport } from "~/components/match-page/useMatchWeaponReport";
import { WeaponReporter } from "~/components/match-page/WeaponReporter";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import type { CommonUser } from "~/utils/kysely.server";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { useMatch } from "../match-page-context";
import { isSetOverByScore } from "../tournament-match-utils";

export function TournamentMatchActionTab({
	data,
	ownTeamId,
}: {
	data: TournamentMatchLoaderData;
	ownTeamId: number | null;
}) {
	const tournament = useTournament();
	const user = useUser();
	const reportFetcher = useFetcher();
	const {
		teams: [teamOne, teamTwo],
		scores,
		scoreSum,
		currentMap,
	} = useMatch();

	const weaponReport = useTournamentWeaponReport({
		data,
		viewerUserId: user?.id,
		weaponReportingOpen: tournament.weaponReportingOpen,
	});

	// during pick/ban there is no current map to report, but a wrongly reported
	// score from a previous game can still be undone
	if (!currentMap) {
		return (
			<SendouTabPanel id={TAB_KEYS.ACTION}>
				{scoreSum > 0 ? <UndoReportButton scoreSum={scoreSum} /> : null}
				{weaponReport ? <WeaponReporter {...weaponReport} standalone /> : null}
			</SendouTabPanel>
		);
	}

	if (!teamOne || !teamTwo) return null;

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
						tournament,
						teams: [teamOne, teamTwo],
						scores,
						results: data.results,
						opponentOneId: teamOne.id,
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
					avatar: tournament.tournamentTeamLogoSrc(teamOne) ?? undefined,
				},
				{
					id: teamTwo.id,
					name: teamTwo.name,
					avatar: tournament.tournamentTeamLogoSrc(teamTwo) ?? undefined,
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
			actionButtons={<UndoReportButton scoreSum={scoreSum} />}
			secondaryAction={
				weaponReport ? <WeaponReporter {...weaponReport} /> : null
			}
		/>
	);
}

export function UndoReportButton({ scoreSum }: { scoreSum: number }) {
	const { t } = useTranslation(["q"]);
	const undoFetcher = useFetcher();

	return (
		<SendouButton
			variant="minimal-destructive"
			size="miniscule"
			icon={<Undo2 size={16} />}
			isPending={undoFetcher.state !== "idle"}
			isDisabled={scoreSum === 0}
			onPress={() => {
				undoFetcher.submit(
					{
						_action: "UNDO_REPORT_SCORE",
						position: String(scoreSum - 1),
					},
					{ method: "post" },
				);
			}}
			testId="undo-score-button"
		>
			{t("q:match.undoReport")}
		</SendouButton>
	);
}

function useTournamentWeaponReport({
	data,
	viewerUserId,
	weaponReportingOpen,
}: {
	data: TournamentMatchLoaderData;
	viewerUserId: number | undefined;
	weaponReportingOpen: boolean;
}) {
	const playOrderMaps = (data.mapList ?? []).filter(
		(m) => !m.bannedByTournamentTeamId,
	);
	const reportedCount = data.results.length;
	const weaponReportMaps = playOrderMaps
		.slice(0, reportedCount + 1)
		.map((m) => ({ stageId: m.stageId, mode: m.mode }));

	const pastReported =
		data.reportedWeapons && viewerUserId !== undefined
			? data.reportedWeapons
					.filter((w) => w.userId === viewerUserId)
					.map((w) => ({ mapIndex: w.mapIndex, weaponSplId: w.weaponSplId }))
			: [];

	const weaponReport = useMatchWeaponReport({
		maps: weaponReportMaps,
		pastReported,
	});

	if (viewerUserId === undefined) return null;
	if (!weaponReportingOpen) return null;

	const isParticipant = data.match.players.some((p) => p.id === viewerUserId);
	if (!isParticipant) return null;

	if (weaponReportMaps.length === 0) return null;

	return weaponReport;
}

function buildSetEndingData({
	tournament,
	teams,
	scores,
	results,
	opponentOneId,
}: {
	tournament: ReturnType<typeof useTournament>;
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
				avatar: tournament.tournamentTeamLogoSrc(teamOne) ?? undefined,
			},
			bravo: {
				name: teamTwo.name,
				avatar: tournament.tournamentTeamLogoSrc(teamTwo) ?? undefined,
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
