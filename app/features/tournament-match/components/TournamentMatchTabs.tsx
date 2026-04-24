import { differenceInMinutes } from "date-fns";
import { useFetcher } from "react-router";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import type { TimelineMap } from "~/components/match-page/MatchTimeline";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { isLeagueRoundLocked } from "~/features/tournament/tournament-utils";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import {
	groupNumberToLetters,
	tournamentTeamToActiveRosterUserIds,
} from "~/features/tournament-bracket/tournament-bracket-utils";
import { databaseTimestampToDate } from "~/utils/dates";
import { tournamentTeamPage } from "~/utils/urls";
import type { TournamentMatchLoaderData } from "../loaders/to.$id.matches.$mid.server";
import { resolveHostingTeam, resolveRoomPass } from "../tournament-match-utils";
import { TournamentMatchActionPickBanTab } from "./TournamentMatchActionPickBanTab";
import { TournamentMatchActionTab } from "./TournamentMatchActionTab";
import { TournamentMatchAdminTab } from "./TournamentMatchAdminTab";
import { TournamentMatchPickBanTab } from "./TournamentMatchPickBanTab";

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
	const hasMissingActiveRoster = teamsMissingActiveRoster.length > 0;

	const canReportScore = tournament.canReportScore({
		matchId: data.match.id,
		user,
	});
	const isParticipant = data.match.players.some((p) => p.id === user?.id);

	const teamOne = tournament.teamById(opponentOneId);
	const teamTwo = tournament.teamById(opponentTwoId);
	const pickBanTeams =
		teamOne && teamTwo
			? ([teamOne, teamTwo] as [typeof teamOne, typeof teamTwo])
			: undefined;

	const turnOfResult =
		pickBanTeams && data.match.roundMaps
			? PickBan.turnOf({
					results: data.results,
					maps: data.match.roundMaps,
					teams: [
						{ id: pickBanTeams[0].id, seed: pickBanTeams[0].seed },
						{ id: pickBanTeams[1].id, seed: pickBanTeams[1].seed },
					],
					mapList: data.mapList,
					pickBanEventCount: data.pickBanEventCount,
				})
			: null;
	const isPickBanStep = turnOfResult !== null && !hasMissingActiveRoster;
	const hasPickBanSetup =
		Boolean(data.match.roundMaps?.pickBan) && !!pickBanTeams;

	const isAdminEligible =
		tournament.isOrganizerOrStreamer(user) && !tournament.ctx.isFinalized;

	const leagueRoundLocked = isLeagueRoundLocked(tournament, data.match.roundId);

	const tabs = resolveVisibleTabs({
		matchIsOver: data.matchIsOver,
		canReportScore,
		isParticipant,
		hasCurrentMap: Boolean(currentMap),
		hasMissingActiveRoster,
		isPickBanStep,
		hasPickBanSetup,
		isAdminEligible,
		leagueRoundLocked,
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
			{tabs.includes("join") ? <TournamentMatchJoinTab data={data} /> : null}
			<TournamentMatchRosterTab data={data} />
			{tabs.includes("pickBan") && pickBanTeams ? (
				<TournamentMatchPickBanTab data={data} teams={pickBanTeams} />
			) : null}
			{tabs.includes("action") ? (
				isPickBanStep && pickBanTeams && turnOfResult ? (
					<TournamentMatchActionPickBanTab
						key={`${turnOfResult.teamId}-${data.pickBanEventCount}`}
						data={data}
						teams={pickBanTeams}
						turnOfResult={turnOfResult}
					/>
				) : currentMap ? (
					<TournamentMatchActionTab
						data={data}
						currentMap={currentMap}
						ownTeamId={userTeamId ?? opponentOneId}
					/>
				) : null
			) : null}
			{tabs.includes("admin") ? <TournamentMatchAdminTab data={data} /> : null}
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

function TournamentMatchJoinTab({ data }: { data: TournamentMatchLoaderData }) {
	const tournament = useTournament();
	const user = useUser();
	const confirmFetcher = useFetcher();

	const teamOne = tournament.teamById(data.match.opponentOne!.id!)!;
	const teamTwo = tournament.teamById(data.match.opponentTwo!.id!)!;
	const hostingTeam = resolveHostingTeam([teamOne, teamTwo]);

	const hasRoundRobin = tournament.brackets.some(
		(b) => b.type === "round_robin",
	);
	const bracketIdx = tournament.brackets.findIndex((b) =>
		b.data.match.some((m) => m.id === data.match.id),
	);
	const bracket = tournament.brackets[bracketIdx];
	const bracketMatch = bracket?.data.match.find((m) => m.id === data.match.id);
	const group = bracket?.data.group.find(
		(g) => g.id === bracketMatch?.group_id,
	);

	const poolCode = tournament.resolvePoolCode({
		hostingTeamId: hostingTeam.id,
		groupLetters:
			group && bracket?.type === "round_robin"
				? groupNumberToLetters(group.number)
				: undefined,
		bracketNumber:
			hasRoundRobin && bracket?.type !== "round_robin"
				? bracketIdx + 1
				: undefined,
	});

	// xxx: maybe some shared util?
	const freshnessCutoff = data.match.startedAt ?? 0;
	const validRoomLink = data.roomLinks.find(
		(rl) => rl.refreshedAt >= freshnessCutoff,
	);
	const ownStaleRoomLink = validRoomLink
		? undefined
		: data.roomLinks.find((rl) => rl.userId === user?.id);
	const activeRoomLink = validRoomLink ?? ownStaleRoomLink;
	const isStale = activeRoomLink ? !validRoomLink : undefined;
	const staleMinutesAgo = ownStaleRoomLink
		? differenceInMinutes(
				new Date(),
				databaseTimestampToDate(ownStaleRoomLink.refreshedAt),
			)
		: 0;
	const roomLinkUsername = activeRoomLink
		? data.match.players.find((p) => p.id === activeRoomLink.userId)?.username
		: undefined;

	return (
		<MatchJoinTab
			joinLink={activeRoomLink?.url}
			hostedBy={roomLinkUsername ?? hostingTeam.name}
			isStale={isStale}
			staleMinutesAgo={staleMinutesAgo}
			refreshedAt={
				validRoomLink
					? databaseTimestampToDate(validRoomLink.refreshedAt)
					: undefined
			}
			onConfirmRoom={() => {
				confirmFetcher.submit({ _action: "CONFIRM_ROOM" }, { method: "post" });
			}}
			isConfirming={confirmFetcher.state !== "idle"}
			pool={`${poolCode.prefix}${poolCode.suffix}`}
			pass={resolveRoomPass(hostingTeam.id)}
			showNoSplatnetAlert={data.anyUserPrefersNoSplatnet}
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
			!data.matchIsOver &&
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
	isPickBanStep,
	hasPickBanSetup,
	isAdminEligible,
	leagueRoundLocked,
}: {
	matchIsOver: boolean;
	canReportScore: boolean;
	isParticipant: boolean;
	hasCurrentMap: boolean;
	hasMissingActiveRoster: boolean;
	isPickBanStep: boolean;
	hasPickBanSetup: boolean;
	isAdminEligible: boolean;
	leagueRoundLocked: boolean;
}) {
	const tabs: Array<
		"join" | "rosters" | "pickBan" | "action" | "result" | "admin"
	> = [];

	if (matchIsOver) {
		tabs.push("result");
	}
	if (!matchIsOver && isParticipant && !leagueRoundLocked) {
		tabs.push("join");
	}
	tabs.push("rosters");
	if (
		!leagueRoundLocked &&
		(isPickBanStep ||
			(canReportScore && hasCurrentMap && !hasMissingActiveRoster))
	) {
		tabs.push("action");
	}
	if (hasPickBanSetup) {
		tabs.push("pickBan");
	}
	if (isAdminEligible) {
		tabs.push("admin");
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
