import * as React from "react";
import { TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { isLeagueRoundLocked } from "~/features/tournament/tournament-utils";
import * as PickBan from "~/features/tournament-bracket/core/PickBan";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import { tournamentTeamToActiveRosterUserIds } from "~/features/tournament-bracket/tournament-bracket-utils";
import type { TournamentMatchLoaderData } from "./loaders/to.$id.matches.$mid.server";
import { matchIsLocked } from "./tournament-match-utils";

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
		teamOne && teamTwo && data.match.roundMaps
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

	const tabs = resolveVisibleTabs({
		matchIsOver: data.matchIsOver,
		canReportScore: tournament.canReportScore({
			matchId: data.match.id,
			user,
		}),
		canReportWeapons:
			isParticipant && !tournament.ctx.isFinalized && hasReportedMaps,
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
	matchIsOver,
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
	matchIsOver: boolean;
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
	const tabs: MatchTabKey[] = [];

	if (matchIsOver) {
		tabs.push(TAB_KEYS.RESULT);
	}
	if (canJoin) {
		tabs.push(TAB_KEYS.JOIN);
	}
	tabs.push(TAB_KEYS.ROSTERS);
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
	if (!matchIsOver && (hasReportedMaps || hasPickBanEvents)) {
		tabs.push(TAB_KEYS.RESULT);
	}

	return tabs;
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
