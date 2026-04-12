import { differenceInMinutes } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { useFetcher, useLoaderData } from "react-router";
import { LinkButton } from "~/components/elements/Button";
import { containerClassName } from "~/components/Main";
import { MatchActionTab } from "~/components/match-page/MatchActionTab";
import {
	MatchBanner,
	MatchBannerContainer,
} from "~/components/match-page/MatchBanner";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchPage } from "~/components/match-page/MatchPage";
import { MatchPageHeader } from "~/components/match-page/MatchPageHeader";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { databaseTimestampToJavascriptTimestamp } from "~/utils/dates";
import type { CommonUser } from "~/utils/kysely.server";
import { tournamentBracketsPage, tournamentTeamPage } from "~/utils/urls";
import { action } from "../actions/to.$id.matches.$mid.server";
import { loader } from "../loaders/to.$id.matches.$mid.server";
import { isSetOverByScore } from "../tournament-bracket-utils";

export { action, loader };

// xxx: can we simplify loader to return values that are closer to what we want to display?

export default function TournamentMatchPage() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();

	const opponentOne = data.match.opponentOne;
	const opponentTwo = data.match.opponentTwo;

	const scoreSum = (opponentOne?.score ?? 0) + (opponentTwo?.score ?? 0);

	const currentMap = data.mapList?.filter((m) => !m.bannedByTournamentTeamId)[
		scoreSum
	];

	const activeRosterByTeamId = (tournamentTeamId: number) => {
		const team = tournament.teamById(tournamentTeamId);
		if (!team) return null;

		const activeRosterUserIds = team.activeRosterUserIds;
		if (!activeRosterUserIds?.length) return null;

		return team.members
			.filter((member) => !activeRosterUserIds.includes(member.userId))
			.map((member) => ({ ...member, id: member.userId }));
	};

	return (
		<MatchPage className={containerClassName("normal")}>
			<TournamentMatchHeader />

			<MatchBannerContainer>
				<TournamentMatchBannerTopRow />
				{currentMap ? (
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

			<TournamentMatchTabs />
		</MatchPage>
	);
}

function TournamentMatchHeader() {
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	const { bracketName, roundName } = tournament.matchContextNamesById(
		data.match.id,
	);

	return (
		<MatchPageHeader
			// xxx: fix !
			subtitle={bracketName!}
			topRight={
				<LinkButton
					to={tournamentBracketsPage({
						tournamentId: tournament.ctx.id,
						bracketIdx: tournament.matchIdToBracketIdx(data.match.id),
						groupId: data.match.groupId,
					})}
					variant="outlined"
					size="small"
					className="w-max"
					icon={<ArrowLeft />}
					testId="back-to-bracket-button"
				>
					Back to bracket
				</LinkButton>
			}
		>
			{roundName}
		</MatchPageHeader>
	);
}

function TournamentMatchBannerTopRow() {
	const currentTime = new Date();
	const data = useLoaderData<typeof loader>();

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

function TournamentMatchTabs() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();
	const user = useUser();

	const opponentOneId = data.match.opponentOne?.id;
	const opponentTwoId = data.match.opponentTwo?.id;
	if (!opponentOneId || !opponentTwoId) return null;

	const scoreSum =
		(data.match.opponentOne?.score ?? 0) + (data.match.opponentTwo?.score ?? 0);
	const currentMap = data.mapList?.filter((m) => !m.bannedByTournamentTeamId)[
		scoreSum
	];

	const canReportScore = tournament.canReportScore({
		matchId: data.match.id,
		user,
	});
	const isParticipant = data.match.players.some((p) => p.id === user?.id);

	const tabs = resolveVisibleTabs({
		matchIsOver: data.matchIsOver,
		canReportScore,
		isParticipant,
		hasCurrentMap: Boolean(currentMap),
	});

	return (
		<MatchTabs tabs={tabs}>
			{tabs.includes("join") ? <TournamentMatchJoinTab /> : null}
			<TournamentMatchRosterTab />
			{tabs.includes("action") ? <TournamentMatchActionTab /> : null}
		</MatchTabs>
	);
}

function TournamentMatchJoinTab() {
	return (
		<MatchJoinTab
			joinLink="https://app.nintendo.net/private_battle/abc123"
			pool="SQ7"
			pass="8430"
			showNoSplatnetAlert
		/>
	);
}

function TournamentMatchRosterTab() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();
	const user = useUser();
	const fetcher = useFetcher();

	const teamOne = tournament.teamById(data.match.opponentOne!.id!)!;
	const teamTwo = tournament.teamById(data.match.opponentTwo!.id!)!;

	return (
		<MatchRosterTab
			minMembersPerTeam={tournament.minMembersPerTeam}
			canEditSubbedOut={[
				canEditSubbedOutForTeam(teamOne),
				canEditSubbedOutForTeam(teamTwo),
			]}
			onSubbedOutChange={handleSubbedOutChange}
			isSubmitting={fetcher.state !== "idle"}
			teams={[rosterTeamData(teamOne), rosterTeamData(teamTwo)]}
		/>
	);

	function rosterTeamData(
		team: NonNullable<ReturnType<typeof tournament.teamById>>,
	) {
		const subbedOut =
			team.activeRosterUserIds &&
			team.members.length > tournament.minMembersPerTeam
				? team.members
						.filter((m) => !team.activeRosterUserIds!.includes(m.userId))
						.map((m) => m.userId)
				: undefined;

		return {
			team: {
				id: team.id,
				name: team.name,
				url: tournamentTeamPage({
					tournamentId: tournament.ctx.id,
					tournamentTeamId: team.id,
				}),
				avatar: team.pickupAvatarUrl ?? undefined,
			},
			members: team.members.map((m) => ({
				id: m.userId,
				username: m.username,
				discordId: m.discordId,
				discordAvatar: m.discordAvatar,
				customUrl: m.customUrl,
			})),
			subbedOut,
		};
	}

	function canEditSubbedOutForTeam(
		team: NonNullable<ReturnType<typeof tournament.teamById>>,
	) {
		if (data.matchIsOver) return false;
		if (data.results.length > 0) return false;
		if (team.members.length <= tournament.minMembersPerTeam) return false;

		const isMemberOfTeam = team.members.some((m) => m.userId === user?.id);
		return isMemberOfTeam || tournament.isOrganizer(user);
	}

	function handleSubbedOutChange(teamId: number, subbedOut: number[]) {
		const team = tournament.teamById(teamId);
		if (!team) return;

		const activeRoster = team.members
			.filter((m) => !subbedOut.includes(m.userId))
			.map((m) => m.userId);

		fetcher.submit(
			{
				_action: "SET_ACTIVE_ROSTER",
				roster: JSON.stringify(activeRoster),
				teamId: String(teamId),
			},
			{ method: "post" },
		);
	}
}

function TournamentMatchActionTab() {
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();
	const user = useUser();

	const opponentOneId = data.match.opponentOne!.id!;
	const opponentTwoId = data.match.opponentTwo!.id!;

	const scores: [number, number] = [
		data.match.opponentOne?.score ?? 0,
		data.match.opponentTwo?.score ?? 0,
	];
	const scoreSum = scores[0] + scores[1];

	const currentMap = data.mapList?.filter((m) => !m.bannedByTournamentTeamId)[
		scoreSum
	];
	if (!currentMap) return null;

	const teamOne = tournament.teamById(opponentOneId)!;
	const teamTwo = tournament.teamById(opponentTwoId)!;

	const userTeamId = tournament.teamMemberOfByUser(user)?.id;
	const withPoints = tournament.bracketByIdxOrDefault(
		tournament.matchIdToBracketIdx(data.match.id) ?? 0,
	).collectResultsWithPoints;

	const count = data.match.roundMaps.count;
	const countType = data.match.roundMaps.type;

	// xxx: we can do something better here
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
			ownTeamId={userTeamId ?? teamOne.id}
			stageId={currentMap.stageId}
			mode={currentMap.mode}
			withPoints={withPoints}
			setEnding={setEnding}
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
	results: ReturnType<typeof useLoaderData<typeof loader>>["results"];
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

function resolveVisibleTabs({
	matchIsOver,
	canReportScore,
	isParticipant,
	hasCurrentMap,
}: {
	matchIsOver: boolean;
	canReportScore: boolean;
	isParticipant: boolean;
	hasCurrentMap: boolean;
}) {
	const tabs: Array<"join" | "rosters" | "action"> = [];

	if (!matchIsOver && isParticipant) {
		tabs.push("join");
	}
	tabs.push("rosters");
	if (canReportScore && hasCurrentMap) {
		tabs.push("action");
	}

	return tabs;
}
