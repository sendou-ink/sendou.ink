import * as React from "react";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import { resolveActiveRoomLink } from "~/features/chat/room-link-utils";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { isLeagueRoundLocked } from "~/features/tournament/tournament-utils";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import {
	groupNumberToLetters,
	tournamentTeamToActiveRosterUserIds,
} from "~/features/tournament-bracket/tournament-bracket-utils";
import type { TournamentMatchLoaderData } from "./loaders/to.$id.matches.$mid.server";
import { matchIsLocked, resolveHostingTeam } from "./tournament-match-utils";

type ActiveRoomLink = ReturnType<typeof resolveActiveRoomLink>;

export type MatchPageTeam = NonNullable<ReturnType<Tournament["teamById"]>>;

export type MatchTabKey = (typeof TAB_KEYS)[keyof typeof TAB_KEYS];

type MatchPageMapListEntry = NonNullable<
	TournamentMatchLoaderData["mapList"]
>[number];

type MatchPageContextValue = {
	data: TournamentMatchLoaderData;
	teams: [MatchPageTeam | null, MatchPageTeam | null];
	scores: [number, number];
	scoreSum: number;
	currentMap: MatchPageMapListEntry | undefined;
	tabs: MatchTabKey[];
	teamsMissingActiveRoster: string[];
	turnOfResult: ReturnType<typeof PickBan.turnOf>;
	isPickBanStep: boolean;
	matchIsLocked: boolean;
	joinPool: string | null;
	activeRoomLink: ActiveRoomLink | null;
};

const MatchPageContext = React.createContext<MatchPageContextValue | null>(
	null,
);

export function MatchPageProvider({
	data,
	children,
}: {
	data: TournamentMatchLoaderData;
	children: React.ReactNode;
}) {
	const tournament = useTournament();
	const user = useUser();

	const opponentOneId = data.match.opponentOne?.id;
	const opponentTwoId = data.match.opponentTwo?.id;

	const teams: [MatchPageTeam | null, MatchPageTeam | null] = [
		(opponentOneId ? tournament.teamById(opponentOneId) : null) ?? null,
		(opponentTwoId ? tournament.teamById(opponentTwoId) : null) ?? null,
	];
	const [teamOne, teamTwo] = teams;

	const scores: [number, number] = [
		data.match.opponentOne?.score ?? 0,
		data.match.opponentTwo?.score ?? 0,
	];
	const scoreSum = scores[0] + scores[1];

	const currentMap = data.mapList?.filter((m) => !m.bannedByTournamentTeamId)[
		scoreSum
	];

	const teamsMissingActiveRoster = resolveTeamsMissingActiveRoster(
		teams,
		tournament.minMembersPerTeam,
	);

	const turnOfResult =
		teamOne && teamTwo && data.match.roundMaps && !data.matchIsOver
			? PickBan.turnOf({
					results: data.results,
					maps: data.match.roundMaps,
					teams: [
						{ id: teamOne.id, seed: teamOne.seed },
						{ id: teamTwo.id, seed: teamTwo.seed },
					],
					mapList: data.mapList,
					pickBanEventCount: data.pickBanEventCount,
				})
			: null;
	const isPickBanStep =
		turnOfResult !== null && teamsMissingActiveRoster.length === 0;

	const isParticipant = data.match.players.some((p) => p.id === user?.id);
	const hasReportedMaps = data.results.length > 0;

	const lockedForCast = matchIsLocked({
		tournament,
		matchId: data.match.id,
		scores,
	});

	const joinPool = resolveJoinPool({ tournament, data, teams });

	const activeRoomLink = data.canJoin
		? resolveActiveRoomLink({
				roomLinks: data.roomLinks,
				freshnessCutoff: data.match.startedAt ?? 0,
				viewerUserId: user?.id,
				members: data.match.players,
			})
		: null;

	const tabs = resolveVisibleTabs({
		canReportScore: tournament.canReportScore({
			matchId: data.match.id,
			user,
		}),
		canReportWeapons:
			isParticipant && tournament.weaponReportingOpen && hasReportedMaps,
		canJoin: data.canJoin,
		hasCurrentMap: Boolean(currentMap),
		hasMissingActiveRoster: teamsMissingActiveRoster.length > 0,
		hasReportedMaps,
		hasPickBanEvents: data.pickBanEventCount > 0,
		isPickBanStep,
		isAdminEligible:
			tournament.isOrganizerOrStreamer(user) && !tournament.ctx.isFinalized,
		leagueRoundLocked: isLeagueRoundLocked(tournament, data.match.roundId),
		lockedForCast,
	});

	return (
		<MatchPageContext.Provider
			value={{
				data,
				teams,
				scores,
				scoreSum,
				currentMap,
				tabs,
				teamsMissingActiveRoster,
				turnOfResult,
				isPickBanStep,
				matchIsLocked: lockedForCast,
				joinPool,
				activeRoomLink,
			}}
		>
			{children}
		</MatchPageContext.Provider>
	);
}

export function useMatch() {
	const ctx = React.useContext(MatchPageContext);
	if (!ctx) {
		throw new Error("useMatch must be used within MatchPageProvider");
	}
	return ctx;
}

function resolveVisibleTabs({
	canReportScore,
	canReportWeapons,
	canJoin,
	hasCurrentMap,
	hasMissingActiveRoster,
	hasReportedMaps,
	hasPickBanEvents,
	isPickBanStep,
	isAdminEligible,
	leagueRoundLocked,
	lockedForCast,
}: {
	canReportScore: boolean;
	canReportWeapons: boolean;
	canJoin: boolean;
	hasCurrentMap: boolean;
	hasMissingActiveRoster: boolean;
	hasReportedMaps: boolean;
	hasPickBanEvents: boolean;
	isPickBanStep: boolean;
	isAdminEligible: boolean;
	leagueRoundLocked: boolean;
	lockedForCast: boolean;
}): MatchTabKey[] {
	const tabs: MatchTabKey[] = [TAB_KEYS.ROSTERS];

	if (canJoin) {
		tabs.push(TAB_KEYS.JOIN);
	}
	if (
		!leagueRoundLocked &&
		(isPickBanStep ||
			(canReportScore &&
				hasCurrentMap &&
				!hasMissingActiveRoster &&
				!lockedForCast) ||
			canReportWeapons)
	) {
		tabs.push(TAB_KEYS.ACTION);
	}
	if (isAdminEligible) {
		tabs.push(TAB_KEYS.ADMIN);
	}
	// matchIsOver with no reports nor pick/ban events = drop-out / forfeit;
	// no results to show
	if (hasReportedMaps || hasPickBanEvents) {
		tabs.push(TAB_KEYS.RESULT);
	}

	return tabs;
}

function resolveJoinPool({
	tournament,
	data,
	teams,
}: {
	tournament: ReturnType<typeof useTournament>;
	data: TournamentMatchLoaderData;
	teams: [MatchPageTeam | null, MatchPageTeam | null];
}): string | null {
	if (!data.canJoin) return null;

	const [teamOne, teamTwo] = teams;
	if (!teamOne || !teamTwo) return null;

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

	return `${poolCode.prefix}${poolCode.suffix}`;
}

function resolveTeamsMissingActiveRoster(
	teams: [MatchPageTeam | null, MatchPageTeam | null],
	minMembersPerTeam: number,
): string[] {
	return teams
		.filter((team): team is MatchPageTeam => team != null)
		.filter(
			(team) => !tournamentTeamToActiveRosterUserIds(team, minMembersPerTeam),
		)
		.map((team) => team.name);
}
