import { useFetcher } from "react-router";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import type { TimelineMap } from "~/components/match-page/MatchTimeline";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { tournamentTeamToActiveRosterUserIds } from "~/features/tournament-bracket/tournament-bracket-utils";
import { tournamentTeamPage } from "~/utils/urls";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { TournamentMatchActionTab } from "./TournamentMatchActionTab";

export function TournamentMatchTabs({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
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

	const teamsMissingActiveRoster = resolveTeamsMissingActiveRoster(
		data,
		tournament,
	);

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
		hasMissingActiveRoster: teamsMissingActiveRoster.length > 0,
	});

	const userTeamId = tournament.teamMemberOfByUser(user)?.id;

	return (
		<MatchTabs tabs={tabs}>
			{tabs.includes("result") ? (
				<MatchResultTab
					teams={resolveTimelineTeams(opponentOneId, opponentTwoId, tournament)}
					score={{
						alpha: data.match.opponentOne?.score ?? 0,
						bravo: data.match.opponentTwo?.score ?? 0,
					}}
					maps={resolveTimelineMaps(data, opponentOneId, opponentTwoId)}
				/>
			) : null}
			{tabs.includes("join") ? <TournamentMatchJoinTab /> : null}
			<TournamentMatchRosterTab data={data} />
			{tabs.includes("action") && currentMap ? (
				<TournamentMatchActionTab
					data={data}
					currentMap={currentMap}
					ownTeamId={userTeamId ?? opponentOneId}
				/>
			) : null}
		</MatchTabs>
	);
}

function resolveTimelineTeams(
	opponentOneId: number,
	opponentTwoId: number,
	tournament: ReturnType<typeof useTournament>,
) {
	const teamOne = tournament.teamById(opponentOneId);
	const teamTwo = tournament.teamById(opponentTwoId);

	return {
		alpha: {
			name: teamOne?.name ?? "?",
			avatar: teamOne?.pickupAvatarUrl ?? undefined,
		},
		bravo: {
			name: teamTwo?.name ?? "?",
			avatar: teamTwo?.pickupAvatarUrl ?? undefined,
		},
	};
}

function resolveTimelineMaps(
	data: TournamentMatchLoaderData,
	opponentOneId: number,
	opponentTwoId: number,
): TimelineMap[] {
	const playerById = new Map(data.match.players.map((p) => [p.id, p]));

	const resolveRoster = (
		participants: (typeof data.results)[number]["participants"],
		tournamentTeamId: number,
	) =>
		participants
			.filter((p) => p.tournamentTeamId === tournamentTeamId)
			.map((p) => playerById.get(p.userId))
			.filter((u): u is NonNullable<typeof u> => u != null)
			.map((u) => ({
				id: u.id,
				username: u.username,
				discordId: u.discordId,
				discordAvatar: u.discordAvatar,
				customUrl: u.customUrl,
			}));

	return data.results.map((result) => {
		const hasPoints =
			result.opponentOnePoints !== null && result.opponentTwoPoints !== null;

		return {
			stageId: result.stageId,
			mode: result.mode,
			timestamp: result.createdAt,
			winner:
				result.winnerTeamId === opponentOneId
					? ("ALPHA" as const)
					: ("BRAVO" as const),
			rosters: {
				alpha: resolveRoster(result.participants, opponentOneId),
				bravo: resolveRoster(result.participants, opponentTwoId),
			},
			points: hasPoints
				? ([result.opponentOnePoints, result.opponentTwoPoints] as [
						number,
						number,
					])
				: undefined,
		};
	});
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

function TournamentMatchRosterTab({
	data,
}: {
	data: TournamentMatchLoaderData;
}) {
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
			defaultIsEditing={[
				needsActiveRosterSelection(teamOne),
				needsActiveRosterSelection(teamTwo),
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
		if (team.members.length <= tournament.minMembersPerTeam) return false;

		const isMemberOfTeam = team.members.some((m) => m.userId === user?.id);
		return isMemberOfTeam || tournament.isOrganizer(user);
	}

	function needsActiveRosterSelection(
		team: NonNullable<ReturnType<typeof tournament.teamById>>,
	) {
		if (!canEditSubbedOutForTeam(team)) return false;
		return !tournamentTeamToActiveRosterUserIds(
			team,
			tournament.minMembersPerTeam,
		);
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

function resolveVisibleTabs({
	matchIsOver,
	canReportScore,
	isParticipant,
	hasCurrentMap,
	hasMissingActiveRoster,
}: {
	matchIsOver: boolean;
	canReportScore: boolean;
	isParticipant: boolean;
	hasCurrentMap: boolean;
	hasMissingActiveRoster: boolean;
}) {
	const tabs: Array<"join" | "rosters" | "action" | "result"> = [];

	if (matchIsOver) {
		tabs.push("result");
	}
	if (!matchIsOver && isParticipant) {
		tabs.push("join");
	}
	tabs.push("rosters");
	if (canReportScore && hasCurrentMap && !hasMissingActiveRoster) {
		tabs.push("action");
	}

	return tabs;
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
