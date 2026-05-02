import clsx from "clsx";
import { Undo2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { SendouButton } from "~/components/elements/Button";
import { SendouTabPanel } from "~/components/elements/Tabs";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import {
	WeaponReporter,
	type WeaponReporterProps,
} from "~/components/match-page/WeaponReporter";
import { useUser } from "~/features/auth/core/user";
import { useRecentlyReportedWeapons } from "~/features/sendouq/q-hooks";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
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
	ownTeamId: number;
}) {
	const { t } = useTranslation(["q"]);
	const tournament = useTournament();
	const user = useUser();
	const reportFetcher = useFetcher();
	const undoFetcher = useFetcher();
	const {
		teams: [teamOne, teamTwo],
		scores,
		scoreSum,
		currentMap,
	} = useMatch();

	const weaponReport = useTournamentWeaponReport({
		data,
		viewerUserId: user?.id,
	});

	if (!currentMap) {
		return (
			<SendouTabPanel id={TAB_KEYS.ACTION}>
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
			weaponReport={weaponReport ?? undefined}
		/>
	);
}

function useTournamentWeaponReport({
	data,
	viewerUserId,
}: {
	data: TournamentMatchLoaderData;
	viewerUserId: number | undefined;
}): WeaponReporterProps | null {
	const weaponFetcher = useFetcher();
	const { recentlyReportedWeapons, addRecentlyReportedWeapon } =
		useRecentlyReportedWeapons();

	if (viewerUserId === undefined) return null;

	const isParticipant = data.match.players.some((p) => p.id === viewerUserId);
	if (!isParticipant) return null;

	const playOrderMaps = (data.mapList ?? []).filter(
		(m) => !m.bannedByTournamentTeamId,
	);
	const reportedCount = data.results.length;
	const weaponReportMaps = playOrderMaps
		.slice(0, reportedCount + 1)
		.map((m) => ({ stageId: m.stageId, mode: m.mode }));

	if (weaponReportMaps.length === 0) return null;

	const pastReported: MainWeaponId[] = data.reportedWeapons
		? data.reportedWeapons
				.filter((w) => w.userId === viewerUserId)
				.map((w) => w.weaponSplId)
		: [];

	return {
		maps: weaponReportMaps,
		pastReported,
		quickSelectWeaponIds: recentlyReportedWeapons,
		isSubmitting: weaponFetcher.state !== "idle",
		onSubmit: (weaponSplId) => {
			addRecentlyReportedWeapon(weaponSplId);
			const mapIndex = pastReported.length;
			weaponFetcher.submit(
				{
					_action: "REPORT_WEAPON",
					weaponSplId: String(weaponSplId),
					mapIndex: String(mapIndex),
				},
				{ method: "post" },
			);
		},
		onUndo: () => {
			const mapIndex = pastReported.length - 1;
			if (mapIndex < 0) return;
			weaponFetcher.submit(
				{
					_action: "UNDO_WEAPON_REPORT",
					mapIndex: String(mapIndex),
				},
				{ method: "post" },
			);
		},
	};
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
