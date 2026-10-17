import * as R from "remeda";
import type { Tables } from "~/db/tables";
import * as Engine from "~/features/tournament-bracket/core/engine";
import type {
	BracketData,
	MatchData,
} from "~/features/tournament-bracket/core/engine/types";
import * as Standings from "~/features/tournament/core/Standings";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { cutToNDecimalPlaces } from "../../../../utils/number";
import { calculateTeamStatus } from "../engine/swiss/team-status";
import { type BracketMapCounts, roundSetKey } from "../toMapList";
import { Bracket, type Standing, type TeamTrackRecord } from "./Bracket";
import * as Tiebreakers from "./Tiebreakers";

type SwissTeamRecord = {
	id: number;
	setWins: number;
	setLosses: number;
	mapWins: number;
	mapLosses: number;
	winsAgainstTied: number;
	lossesAgainstTied: number;
	opponentSets: TeamTrackRecord;
	opponentMaps: TeamTrackRecord;
};

type GroupPlacement = Standing & { groupId: number };

export class SwissBracket extends Bracket {
	source({
		placements,
		advanceThreshold,
		rest,
	}: {
		placements: number[];
		advanceThreshold?: number;
		rest?: boolean;
	}): {
		relevantMatchesFinished: boolean;
		teams: number[];
	} {
		invariant(
			advanceThreshold || placements.length > 0,
			"Placements or advanceThreshold required",
		);
		if (placements.some((p) => p < 0)) {
			throw new Error("Negative placements not implemented");
		}
		const standings = this.standings;

		const relevantMatchesFinished = this.standingsAreFinal;

		// explicit placements override the threshold, e.g. a consolation bracket for the teams that did not advance
		if (advanceThreshold && placements.length === 0) {
			return {
				relevantMatchesFinished,
				teams: standings
					.map((standing) => ({
						...standing,
						status: calculateTeamStatus({
							advanceThreshold,
							wins: standing.stats?.setWins ?? 0,
							losses: standing.stats?.setLosses ?? 0,
							roundCount: this.swissRoundCount,
						}),
					}))
					.filter((t) => t.status === "advanced")
					.map((t) => t.team.id),
			};
		}

		const uniquePlacements = R.unique(standings.map((s) => s.placement));

		// 1,3,5 -> 1,2,3 e.g.
		const placementNormalized = (p: number) => {
			return uniquePlacements.indexOf(p) + 1;
		};

		const maxExplicit = Math.max(...placements);
		const matchesPlacement = (p: number) =>
			placements.includes(p) || (rest === true && p >= maxExplicit);

		return {
			relevantMatchesFinished,
			teams: standings
				.filter((s) => matchesPlacement(placementNormalized(s.placement)))
				.map((s) => s.team.id),
		};
	}

	/**
	 * Rounds are paired one at a time, so a round without matches yet can still change the standings,
	 * unless it can never be paired because every team already advanced or got eliminated.
	 */
	get everyMatchOver() {
		if (!super.everyMatchOver) return false;

		return this.data.group.every((group) => {
			const groupsMatches = this.data.match.filter(
				(match) => match.groupId === group.id,
			);
			if (groupsMatches.length === 0) return false;

			const everyRoundPaired = this.data.round
				.filter((round) => round.groupId === group.id)
				.every((round) =>
					groupsMatches.some((match) => match.roundId === round.id),
				);
			if (everyRoundPaired) return true;

			return !Engine.groupHasActiveTeams(this.data, {
				groupId: group.id,
				standings: this.standings,
				settings: this.settings,
			});
		});
	}

	protected calculateStandings(): Standing[] {
		return this.computeStandings({ includeUnfinishedGroups: false });
	}

	protected calculateLiveStandings(): Standing[] {
		return this.computeStandings({ includeUnfinishedGroups: true });
	}

	private computeStandings({
		includeUnfinishedGroups,
	}: {
		includeUnfinishedGroups: boolean;
	}): Standing[] {
		const groupIds = this.data.group.map((group) => group.id);

		const placements: GroupPlacement[] = [];
		for (const groupId of groupIds) {
			const matches = this.data.match.filter(
				(match) => match.groupId === groupId,
			);

			if (!isGroupFinished(matches) && !includeUnfinishedGroups) continue;

			placements.push(...this.groupPlacements(groupId, matches));
		}

		return this.standingsWithoutNonParticipants(
			Standings.reNumberPlacements(this.sortedAcrossGroups(placements)),
		);
	}

	private groupPlacements(
		groupId: number,
		matches: MatchData[],
	): GroupPlacement[] {
		const teams: SwissTeamRecord[] = [];
		const matchUps = new Map<number, number[]>();

		for (const match of matches) {
			addMatchUp(matchUps, match);
			addMatchResult(teams, match);
		}

		for (const match of matches) {
			this.addByeWin(teams, match);
		}

		addOpponentRecords(teams, matchUps);

		const droppedOutTeams = this.tournament.ctx.teams
			.filter((t) => t.droppedOut)
			.map((t) => t.id);

		// teams that finished their run keep counting so dropping them only moves the teams below up
		const droppedOutMidRunTeamIds = new Set(
			teams
				.filter(
					(team) =>
						droppedOutTeams.includes(team.id) && !this.runIsComplete(team),
				)
				.map((team) => team.id),
		);

		addResultsAgainstTied({
			teams,
			matches,
			ignoredTeamIds: droppedOutMidRunTeamIds,
		});

		return (
			teams
				// client-side the layout's teams can lag behind freshly loaded match data, mostly preview tournaments (prevent crash)
				.filter((team) => this.tournament.teamById(team.id))
				.map((team) => ({
					id: team.id,
					stats: {
						setWins: team.setWins,
						setLosses: team.setLosses,
						mapWins: team.mapWins,
						mapLosses: team.mapLosses,
						winsAgainstTied: team.winsAgainstTied,
						lossesAgainstTied: team.lossesAgainstTied,
						opponentSetWinPercentage: this.trackRecordToWinPercentage(
							team.opponentSets,
						),
						opponentMapWinPercentage: this.trackRecordToWinPercentage(
							team.opponentMaps,
						),
					},
				}))
				.sort((a, b) => this.compareGroupTeams(a, b, droppedOutTeams))
				.map((team, i) => {
					return {
						team: this.tournament.teamById(team.id)!,
						placement: i + 1,
						groupId,
						stats: team.stats,
					};
				})
		);
	}

	private addByeWin(teams: SwissTeamRecord[], match: MatchData) {
		if (match.opponent1 && match.opponent2) {
			return;
		}

		const winner = match.opponent1 ? match.opponent1 : match.opponent2;

		if (!winner?.id) {
			logger.warn("SwissBracket.computeStandings: winner not found");
			return;
		}

		const round = this.data.round.find(
			(candidate) => candidate.id === match.roundId,
		);
		const mapWins =
			round?.maps?.type === "PLAY_ALL"
				? round?.maps?.count
				: Math.ceil((round?.maps?.count ?? 0) / 2);
		// preview
		if (!mapWins) {
			return;
		}

		updateTeam(teams, {
			teamId: winner.id,
			setWins: 1,
			setLosses: 0,
			mapWins,
			mapLosses: 0,
		});
	}

	private compareGroupTeams(
		a: { id: number; stats: NonNullable<Standing["stats"]> },
		b: { id: number; stats: NonNullable<Standing["stats"]> },
		droppedOutTeams: number[],
	) {
		// TIEBREAKER 0) dropped out teams are always last
		const aDroppedOut = droppedOutTeams.includes(a.id);
		const bDroppedOut = droppedOutTeams.includes(b.id);

		if (aDroppedOut && !bDroppedOut) return 1;
		if (!aDroppedOut && bDroppedOut) return -1;

		const tiebreakerResult = Tiebreakers.compare(
			this.tiebreakers,
			a.stats,
			b.stats,
		);
		if (tiebreakerResult !== 0) return tiebreakerResult;

		// initial seeding made by the TO
		const aSeed = Number(this.tournament.teamById(a.id)?.seed);
		const bSeed = Number(this.tournament.teamById(b.id)?.seed);

		if (aSeed < bSeed) return -1;
		if (aSeed > bSeed) return 1;

		return 0;
	}

	private sortedAcrossGroups(placements: GroupPlacement[]) {
		const effectiveSeed = this.effectiveSeedResolver();
		return placements.sort((a, b) => {
			if (a.placement < b.placement) return -1;
			if (a.placement > b.placement) return 1;

			const aEffectiveSeed = effectiveSeed(a.team.id);
			const bEffectiveSeed = effectiveSeed(b.team.id);
			if (aEffectiveSeed < bEffectiveSeed) return -1;
			if (aEffectiveSeed > bEffectiveSeed) return 1;

			if (a.groupId < b.groupId) return -1;
			if (a.groupId > b.groupId) return 1;

			return 0;
		});
	}

	/** Has the team played every round or, with an advance threshold, already advanced or been eliminated? */
	private runIsComplete({
		setWins,
		setLosses,
	}: {
		setWins: number;
		setLosses: number;
	}) {
		const roundCount = this.swissRoundCount;
		if (setWins + setLosses >= roundCount) return true;

		const advanceThreshold = this.settings?.advanceThreshold;
		if (!advanceThreshold) return false;

		return (
			calculateTeamStatus({
				wins: setWins,
				losses: setLosses,
				advanceThreshold,
				roundCount,
			}) !== "active"
		);
	}

	private trackRecordToWinPercentage(trackRecord: TeamTrackRecord) {
		const onlyByes = trackRecord.wins === 0 && trackRecord.losses === 0;
		if (onlyByes) {
			return 0;
		}

		return cutToNDecimalPlaces(
			(trackRecord.wins / (trackRecord.wins + trackRecord.losses)) * 100,
			2,
		);
	}

	get type(): Tables["TournamentStage"]["type"] {
		return "swiss";
	}

	get tiebreakers() {
		return Tiebreakers.SWISS;
	}

	defaultRoundBestOfs(data: BracketData) {
		const result: BracketMapCounts = new Map();

		for (const round of data.round) {
			const key = roundSetKey(round);
			if (!result.get(key)) {
				result.set(key, new Map());
			}

			result.get(key)!.set(round.number, { count: 3, type: "BEST_OF" });
		}

		return result;
	}

	ongoingMatches(): number[] {
		// Swiss matches get startedAt at creation time, not via ongoing detection
		return [];
	}
}

function isGroupFinished(matches: MatchData[]) {
	return matches.every(
		(match) =>
			// BYE
			match.opponent1 === null ||
			match.opponent2 === null ||
			// match was played out
			match.winnerSide,
	);
}

function updateTeam(
	teams: SwissTeamRecord[],
	{
		teamId,
		setWins = 0,
		setLosses = 0,
		mapWins = 0,
		mapLosses = 0,
		opponentSets = { wins: 0, losses: 0 },
		opponentMaps = { wins: 0, losses: 0 },
	}: {
		teamId: number;
		setWins?: number;
		setLosses?: number;
		mapWins?: number;
		mapLosses?: number;
		opponentSets?: TeamTrackRecord;
		opponentMaps?: TeamTrackRecord;
	},
) {
	const team = teams.find((candidate) => candidate.id === teamId);
	if (team) {
		team.setWins += setWins;
		team.setLosses += setLosses;
		team.mapWins += mapWins;
		team.mapLosses += mapLosses;

		team.opponentSets.wins += opponentSets.wins;
		team.opponentSets.losses += opponentSets.losses;
		team.opponentMaps.wins += opponentMaps.wins;
		team.opponentMaps.losses += opponentMaps.losses;
	} else {
		teams.push({
			id: teamId,
			setWins,
			setLosses,
			mapWins,
			mapLosses,
			winsAgainstTied: 0,
			lossesAgainstTied: 0,
			opponentMaps,
			opponentSets,
		});
	}
}

function addMatchUp(matchUps: Map<number, number[]>, match: MatchData) {
	if (!match.opponent1?.id || !match.opponent2?.id) return;

	const opponentOneMatchUps = matchUps.get(match.opponent1.id) ?? [];
	const opponentTwoMatchUps = matchUps.get(match.opponent2.id) ?? [];

	matchUps.set(match.opponent1.id, [
		...opponentOneMatchUps,
		match.opponent2.id,
	]);
	matchUps.set(match.opponent2.id, [
		...opponentTwoMatchUps,
		match.opponent1.id,
	]);
}

function addMatchResult(teams: SwissTeamRecord[], match: MatchData) {
	if (!match.winnerSide) {
		// teams yet to finish a match still belong in the standings
		if (match.opponent1?.id) {
			updateTeam(teams, { teamId: match.opponent1.id });
		}
		if (match.opponent2?.id) {
			updateTeam(teams, { teamId: match.opponent2.id });
		}
		return;
	}

	const winner =
		match.winnerSide === "opponent1" ? match.opponent1 : match.opponent2;

	const loser =
		match.winnerSide === "opponent1" ? match.opponent2 : match.opponent1;

	if (!winner || !loser) return;

	invariant(
		typeof winner.id === "number" && typeof loser.id === "number",
		"SwissBracket.standings: winner or loser id not found",
	);

	// note: score might be missing in the case the set was ended early
	updateTeam(teams, {
		teamId: winner.id,
		setWins: 1,
		setLosses: 0,
		mapWins: winner.score ?? 0,
		mapLosses: loser.score ?? 0,
	});
	updateTeam(teams, {
		teamId: loser.id,
		setWins: 0,
		setLosses: 1,
		mapWins: loser.score ?? 0,
		mapLosses: winner.score ?? 0,
	});
}

/** Opponent win %, summing the records of every team played against. */
function addOpponentRecords(
	teams: SwissTeamRecord[],
	matchUps: Map<number, number[]>,
) {
	for (const team of teams) {
		const teamsWhoPlayedAgainst = matchUps.get(team.id) ?? [];

		const opponentSets = {
			wins: 0,
			losses: 0,
		};
		const opponentMaps = {
			wins: 0,
			losses: 0,
		};

		for (const teamId of teamsWhoPlayedAgainst) {
			const opponent = teams.find((t) => t.id === teamId);
			if (!opponent) {
				logger.warn("SwissBracket.computeStandings: opponent not found", {
					teamId,
				});
				continue;
			}

			opponentSets.wins += opponent.setWins;
			opponentSets.losses += opponent.setLosses;

			opponentMaps.wins += opponent.mapWins;
			opponentMaps.losses += opponent.mapLosses;
		}

		updateTeam(teams, {
			teamId: team.id,
			opponentSets,
			opponentMaps,
		});
	}
}

/** Wins against tied, results against teams that dropped out mid-run don't count. */
function addResultsAgainstTied({
	teams,
	matches,
	ignoredTeamIds,
}: {
	teams: SwissTeamRecord[];
	matches: MatchData[];
	ignoredTeamIds: Set<number>;
}) {
	for (const team of teams) {
		if (ignoredTeamIds.has(team.id)) continue;

		for (const team2 of teams) {
			if (team.id === team2.id) continue;
			if (ignoredTeamIds.has(team2.id)) continue;
			if (
				team.setWins !== team2.setWins ||
				// check also set losses to account for dropped teams
				team.setLosses !== team2.setLosses
			) {
				continue;
			}

			// they are different teams and are tied, let's check who won
			addResultsBetween(team, team2.id, matches);
		}
	}
}

function addResultsBetween(
	team: SwissTeamRecord,
	opponentId: number,
	matches: MatchData[],
) {
	const finishedMatchesBetweenTeams = matches.filter((match) => {
		const isBetweenTeams =
			(match.opponent1?.id === team.id && match.opponent2?.id === opponentId) ||
			(match.opponent1?.id === opponentId && match.opponent2?.id === team.id);

		const isFinished = Boolean(match.winnerSide);

		return isBetweenTeams && isFinished;
	});

	for (const finishedMatchBetweenTeams of finishedMatchesBetweenTeams) {
		const wonTheirMatch =
			(finishedMatchBetweenTeams.opponent1!.id === team.id &&
				finishedMatchBetweenTeams.winnerSide === "opponent1") ||
			(finishedMatchBetweenTeams.opponent2!.id === team.id &&
				finishedMatchBetweenTeams.winnerSide === "opponent2");

		if (wonTheirMatch) {
			team.winsAgainstTied++;
		} else {
			team.lossesAgainstTied++;
		}
	}
}
