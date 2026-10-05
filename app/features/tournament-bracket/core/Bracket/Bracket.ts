import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type { TournamentStageSettings } from "~/db/tables-json";
import * as Standings from "~/features/tournament/core/Standings";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import type {
	BracketData,
	RoundData,
} from "~/features/tournament-bracket/core/engine/types";
import { invariant } from "~/utils/invariant";
import { logger } from "~/utils/logger";
import * as AbDivisions from "../AbDivisions";
import * as Engine from "../engine";
import * as Progression from "../Progression";
import type { OptionalIdObject, Tournament } from "../Tournament";
import type { TournamentDataTeam } from "../Tournament.server";
import type { BracketMapCounts } from "../toMapList";

export interface CreateBracketArgs {
	id: number;
	idx: number;
	preview: boolean;
	data?: BracketData;
	type: Tables["TournamentStage"]["type"];
	participantsReady?: boolean;
	name: string;
	teamsPendingCheckIn?: number[];
	tournament: Tournament;
	createdAt?: number | null;
	sources?: {
		bracketIdx: number;
		placements: number[];
	}[];
	seeding?: number[];
	settings: TournamentStageSettings | null;
	requiresCheckIn: boolean;
	startTime: Date | null;
}

export interface Standing {
	team: TournamentDataTeam;
	placement: number;
	groupId?: number;
	stats?: {
		setWins: number;
		setLosses: number;
		mapWins: number;
		mapLosses: number;
		koCount?: number;
		winsAgainstTied: number;
		lossesAgainstTied?: number;
		opponentSetWinPercentage?: number;
		opponentMapWinPercentage?: number;
	};
}

/** Teams leaving the bracket from a match: the placement tier (or for losers knocked out early, the elimination round) they leave with. */
export interface MatchExit {
	winnerTier?: number;
	loserTier?: number;
	/** 1 = the first round where teams get knocked out, see negative placements of `Progression.DBSource`. */
	loserRound?: number;
}

/** Brackets the winner and loser of a match continue to, for the matches where teams leave the bracket. */
export interface MatchExitDestinations {
	winner: number | null;
	loser: number | null;
}

export interface TeamTrackRecord {
	wins: number;
	losses: number;
}

export abstract class Bracket {
	id;
	idx;
	preview;
	data;
	participantsReady;
	name;
	teamsPendingCheckIn;
	tournament;
	sources;
	createdAt;
	seeding;
	settings;
	requiresCheckIn;
	startTime;
	private _matchStatuses: Map<number, Engine.MatchStatus> | undefined;
	private _simulatedData: { value: BracketData | undefined } | undefined;
	private _standings: Standing[] | undefined;
	private _liveStandings: Standing[] | undefined;

	constructor({
		id,
		idx,
		preview,
		data,
		participantsReady,
		name,
		teamsPendingCheckIn,
		tournament,
		sources,
		createdAt,
		seeding,
		settings,
		requiresCheckIn,
		startTime,
	}: Omit<CreateBracketArgs, "format">) {
		if (!data && !seeding) {
			throw new Error("Bracket: seeding or data required");
		}

		this.id = id;
		this.idx = idx;
		this.preview = preview;
		this.seeding = seeding;
		this.tournament = tournament;
		this.settings = settings;
		this.data = data ?? this.generateMatchesData(this.seeding!);
		this.participantsReady = participantsReady;
		this.name = name;
		this.teamsPendingCheckIn = teamsPendingCheckIn;
		this.sources = sources;
		this.createdAt = createdAt;
		this.requiresCheckIn = requiresCheckIn;
		this.startTime = startTime;
	}

	/** Evaluated on access as it depends on the current time and a bracket can be built (and cached) long before its start time. */
	get canBeStarted() {
		if (!this.participantsReady) return false;
		if (this.startTime && this.startTime > new Date()) return false;
		if (this.sources) return true;

		return this.tournament.regularCheckInHasEnded;
	}

	/** League bracket whose sets the teams schedule, false when it was started to be played in real time. */
	get hasScheduling() {
		return this.tournament.isLeague && !this.data.stage[0]?.settings.isRealtime;
	}

	/** Unplayed matches filled in with the expected results. Simulating is expensive so it happens on first access only. */
	get simulatedData(): BracketData | undefined {
		if (!this._simulatedData) {
			this._simulatedData = { value: this.createdSimulation() };
		}

		return this._simulatedData.value;
	}

	private createdSimulation() {
		if (
			this.type === "round_robin" ||
			this.type === "swiss" ||
			this.preview ||
			this.tournament.ctx.isFinalized
		)
			return;

		try {
			let data = this.data;

			const teamOrder = this.teamOrderForSimulation();
			const bracketResetMatchIds = this.bracketResetMatchIds();

			let matchesToResolve = true;
			let loopCount = 0;
			while (matchesToResolve) {
				if (loopCount > 100) {
					logger.error("Bracket.createdSimulation: loopCount > 100");
					break;
				}
				matchesToResolve = false;
				loopCount++;

				for (const match of data.match) {
					// we have a result already
					if (match.winnerSide) {
						continue;
					}
					// no opponent yet, let's simulate this in a coming loop
					if (
						(match.opponent1 && !match.opponent1.id) ||
						(match.opponent2 && !match.opponent2.id)
					) {
						if (!bracketResetMatchIds.has(match.id)) {
							matchesToResolve = true;
						}

						continue;
					}
					// BYE
					if (match.opponent1 === null || match.opponent2 === null) {
						continue;
					}

					const winner =
						(teamOrder.get(match.opponent1.id!) ?? 0) <
						(teamOrder.get(match.opponent2.id!) ?? 0)
							? 1
							: 2;

					data = Engine.reportResult(data, {
						matchId: match.id,
						scores: winner === 1 ? [1, 0] : [0, 1],
						winnerSide: winner === 1 ? "opponent1" : "opponent2",
					}).data;
				}
			}

			return data;
		} catch (e) {
			logger.error("Bracket.createdSimulation: ", e);

			return;
		}
	}

	/** Double elimination bracket reset matches, played only if the losers bracket team wins the grand finals. */
	protected bracketResetMatchIds() {
		if (this.type !== "double_elimination") return new Set<number>();

		const bracketResetRoundIds = new Set(
			this.data.round
				.filter((round) => round.section === "finals" && round.number === 2)
				.map((round) => round.id),
		);

		return new Set(
			this.data.match
				.filter((match) => bracketResetRoundIds.has(match.roundId))
				.map((match) => match.id),
		);
	}

	private teamOrderForSimulation() {
		const result = new Map(this.tournament.ctx.teams.map((t, i) => [t.id, i]));

		for (const match of this.data.match) {
			if (!match.opponent1?.id || !match.opponent2?.id || !match.winnerSide) {
				continue;
			}

			const opponent1Seed = result.get(match.opponent1.id) ?? -1;
			const opponent2Seed = result.get(match.opponent2.id) ?? -1;
			if (opponent1Seed === -1 || opponent2Seed === -1) {
				logger.error("opponent1Seed or opponent2Seed not found");
				continue;
			}

			if (opponent1Seed < opponent2Seed && match.winnerSide === "opponent1") {
				continue;
			}

			if (opponent2Seed < opponent1Seed && match.winnerSide === "opponent2") {
				continue;
			}

			if (opponent1Seed < opponent2Seed) {
				result.set(match.opponent1.id, opponent1Seed + 0.1);
				result.set(match.opponent2.id, opponent1Seed);
			} else {
				result.set(match.opponent2.id, opponent2Seed + 0.1);
				result.set(match.opponent1.id, opponent2Seed);
			}
		}

		return result;
	}

	simulatedMatch(matchId: number) {
		if (!this.simulatedData) return;

		return this.simulatedData.match.find((match) => match.id === matchId);
	}

	/** Whether reporting a game in this bracket also records if the game was a KO win. */
	get collectsKos() {
		return false;
	}

	abstract get type(): Tables["TournamentStage"]["type"];

	/** Settled standings, teams still playing left out. Safe for deciding who advances. */
	get standings(): Standing[] {
		if (!this._standings) {
			this._standings = this.calculateStandings();
		}

		return this._standings;
	}

	protected abstract calculateStandings(): Standing[];

	/** From the bracket's own stage settings rather than the progression's (editable at any time), so it can't drift. */
	get swissRoundCount() {
		return Engine.swissRoundCount(this.data);
	}

	get participantTournamentTeamIds() {
		return R.unique(
			this.data.match
				.flatMap((match) => [match.opponent1?.id, match.opponent2?.id])
				.filter(Boolean),
		) as number[];
	}

	/** Includes teams still playing: for display, not for deciding who advances. */
	get liveStandings(): Standing[] {
		if (!this._liveStandings) {
			this._liveStandings = this.calculateLiveStandings();
		}

		return this._liveStandings;
	}

	protected calculateLiveStandings(): Standing[] {
		return this.standings;
	}

	winnersSourceRound(_roundNumber: number): RoundData | undefined {
		return;
	}

	protected matchesOfRound(roundId: number) {
		return this.data.match.filter((match) => match.roundId === roundId);
	}

	protected hasNonByeMatch(roundId: number) {
		return this.matchesOfRound(roundId).some(
			(match) => match.opponent1 && match.opponent2,
		);
	}

	/** Exits of the matches teams leave the bracket from, keyed by match id. Only elimination brackets have them. */
	protected matchExits(): Map<number, MatchExit> {
		return new Map();
	}

	/** Brackets the teams leaving the bracket from each match continue to, keyed by match id. Matches whose teams go nowhere are left out. */
	matchExitDestinations(): Map<number, MatchExitDestinations> {
		const progression = this.tournament.ctx.settings.bracketProgression;
		const destination = (placement: number | undefined) =>
			typeof placement === "number"
				? Progression.destinationByPlacement({
						sourceBracketIdx: this.idx,
						placement,
						progression,
					})
				: null;

		const result = new Map<number, MatchExitDestinations>();
		for (const [matchId, exit] of this.matchExits()) {
			const winner = destination(exit.winnerTier);
			const loser =
				destination(
					typeof exit.loserRound === "number" ? -exit.loserRound : undefined,
				) ?? destination(exit.loserTier);

			if (winner === null && loser === null) continue;

			result.set(matchId, { winner, loser });
		}

		return result;
	}

	/** Teams start their tournament from this bracket. There can be more than one. */
	get isStartingBracket() {
		return !this.sources || this.sources.length === 0;
	}

	/**
	 * Effective seed = the better of a team's own seed and the best seed it defeated in this bracket,
	 * so cross-group placement ties break in the overtaker's favor.
	 */
	protected effectiveSeedResolver(): (tournamentTeamId: number) => number {
		const teamSeed = (tournamentTeamId: number) => {
			const seed = this.tournament.teamById(tournamentTeamId)?.seed;
			return typeof seed === "number" ? seed : Number.POSITIVE_INFINITY;
		};

		const bestBeatenSeed = new Map<number, number>();
		for (const match of this.data.match) {
			if (!match.winnerSide) continue;

			const winner =
				match.winnerSide === "opponent1" ? match.opponent1 : match.opponent2;
			const loser =
				match.winnerSide === "opponent1" ? match.opponent2 : match.opponent1;
			if (typeof winner?.id !== "number" || typeof loser?.id !== "number") {
				continue;
			}

			const loserSeed = teamSeed(loser.id);
			const currentBest =
				bestBeatenSeed.get(winner.id) ?? Number.POSITIVE_INFINITY;
			if (loserSeed < currentBest) {
				bestBeatenSeed.set(winner.id, loserSeed);
			}
		}

		return (tournamentTeamId) =>
			Math.min(
				teamSeed(tournamentTeamId),
				bestBeatenSeed.get(tournamentTeamId) ?? Number.POSITIVE_INFINITY,
			);
	}

	/**
	 * One elimination group's standings as is. Many are merged like round robin groups: by placement,
	 * then effective seed, then group. Placements are renumbered across the groups once every team is placed.
	 */
	protected mergedGroupStandings(standingsByGroup: Standing[][]): Standing[] {
		if (standingsByGroup.length <= 1) return standingsByGroup[0] ?? [];

		const effectiveSeed = this.effectiveSeedResolver();
		const sorted = standingsByGroup
			.flatMap((standings, groupIdx) =>
				standings.map((standing) => ({
					...standing,
					groupId: this.data.group[groupIdx].id,
				})),
			)
			.sort((a, b) => {
				if (a.placement !== b.placement) return a.placement - b.placement;

				const aEffectiveSeed = effectiveSeed(a.team.id);
				const bEffectiveSeed = effectiveSeed(b.team.id);
				if (aEffectiveSeed !== bEffectiveSeed) {
					return aEffectiveSeed - bEffectiveSeed;
				}

				return a.groupId - b.groupId;
			});

		const everyTeamPlaced =
			sorted.length === this.participantTournamentTeamIds.length;

		return everyTeamPlaced ? Standings.reNumberPlacements(sorted) : sorted;
	}

	/**
	 * Teams knocked out in the first `roundCount` rounds of the section of each group, the ones that made
	 * it further first. A double elimination losers bracket's first round of only BYEs is not counted.
	 */
	protected sourceByElimination({
		section,
		roundCount,
	}: {
		section: "winners" | "losers";
		roundCount: number;
	}) {
		const sourceRounds = this.data.group.flatMap((group, groupIdx) => {
			const groupRounds = this.data.round
				.filter(
					(round) => round.groupId === group.id && round.section === section,
				)
				.sort((a, b) => a.number - b.number);

			const firstRoundIsOnlyByes =
				section === "losers" &&
				groupRounds.length > 0 &&
				this.data.match
					.filter((match) => match.roundId === groupRounds[0].id)
					.every(
						(match) => match.opponent1 === null || match.opponent2 === null,
					);

			return groupRounds
				.slice(0, roundCount + (firstRoundIsOnlyByes ? 1 : 0))
				.map((round, roundIdx) => ({ round, roundIdx, groupIdx }));
		});

		const teams: number[] = [];
		let relevantMatchesFinished = true;
		for (const { round } of sourceRounds.sort(
			// teams who made it further in the bracket get higher seed
			(a, b) => b.roundIdx - a.roundIdx || a.groupIdx - b.groupIdx,
		)) {
			const roundsMatches = this.data.match.filter(
				(match) => match.roundId === round.id,
			);

			for (const match of roundsMatches) {
				// BYE
				if (!match.opponent1 || !match.opponent2) {
					continue;
				}
				if (!match.winnerSide) {
					relevantMatchesFinished = false;
					continue;
				}

				const loser =
					match.winnerSide === "opponent1" ? match.opponent2 : match.opponent1;
				invariant(loser?.id, "Loser id not found");

				teams.push(loser.id);
			}
		}

		return {
			relevantMatchesFinished,
			teams,
		};
	}

	protected standingsWithoutNonParticipants(standings: Standing[]): Standing[] {
		const participatedUserIds = this.tournament.participatedUserIds;
		// views that did not load participated user ids show full rosters
		if (!participatedUserIds) return standings;

		return standings.map((standing) => {
			return {
				...standing,
				team: {
					...standing.team,
					memberUserIds: standing.team.memberUserIds.filter((userId) =>
						participatedUserIds.includes(userId),
					),
				},
			};
		});
	}

	generateMatchesData(teams: number[]): BracketData {
		if (teams.length >= TOURNAMENT.ENOUGH_TEAMS_TO_START) {
			const abDivisions =
				this.type === "round_robin" && this.settings?.hasAbDivisions === true
					? this.abDivisionsForPreview(
							teams,
							Engine.roundRobinGroupCount(this.settings, teams.length),
						)
					: undefined;

			return Engine.create({
				type: this.type,
				seeding: teams,
				settings: abDivisions
					? this.settings
					: {
							...this.settings,
							hasAbDivisions: false,
						},
				independentRounds: this.tournament.isLeague,
				abDivisions,
			});
		}

		return { stage: [], group: [], round: [], match: [] };
	}

	private abDivisionsForPreview(
		teams: number[],
		groupCount: number,
	): (0 | 1)[] | undefined {
		const assignments = teams.map((teamId) => {
			const team = this.tournament.teamById(teamId);
			return team?.abDivision ?? null;
		});

		const allAssigned = assignments.every(
			(value) => value === 0 || value === 1,
		);
		if (
			allAssigned &&
			AbDivisions.validate({
				abDivisionsBySeedOrder: assignments,
				groupCount,
			}).ok
		) {
			return assignments as (0 | 1)[];
		}

		const fakeAssignments: (0 | 1)[] = teams.map((_, index) =>
			index % 2 === 0 ? 0 : 1,
		);
		if (
			AbDivisions.validate({
				abDivisionsBySeedOrder: fakeAssignments,
				groupCount,
			}).ok
		) {
			return fakeAssignments;
		}

		return undefined;
	}

	get isUnderground() {
		return Progression.isUnderground(
			this.idx,
			this.tournament.ctx.settings.bracketProgression,
		);
	}

	get isFinals() {
		return Progression.isFinals(
			this.idx,
			this.tournament.ctx.settings.bracketProgression,
		);
	}

	/** No further match can change the standings. */
	get standingsAreFinal() {
		return this.everyMatchOver;
	}

	get everyMatchOver() {
		if (this.preview) return false;

		for (const match of this.data.match) {
			// BYE
			if (match.opponent1 === null || match.opponent2 === null) {
				continue;
			}
			if (!match.winnerSide) {
				return false;
			}
		}

		return true;
	}

	get enoughTeams() {
		return (
			this.participantTournamentTeamIds.length >=
			TOURNAMENT.ENOUGH_TEAMS_TO_START
		);
	}

	canCheckIn(user: OptionalIdObject) {
		return this.tournament.canCheckInToBracket(this.idx, user);
	}

	abstract source(options: {
		placements: number[];
		advanceThreshold?: number;
		rest?: boolean;
	}): {
		relevantMatchesFinished: boolean;
		teams: number[];
	};

	/**
	 * Only settled teams appear in the standings, so placements are matched raw until the full
	 * standings resolve and only then normalized (1,3,5 -> 1,2,3) the way group brackets source.
	 */
	protected sourceByStandings(placements: number[], rest: boolean) {
		const standings = this.standings;
		const relevantMatchesFinished =
			standings.length === this.participantTournamentTeamIds.length &&
			this.participantTournamentTeamIds.length > 0;

		const maxExplicit = Math.max(...placements);
		const matchesPlacement = (placement: number) =>
			placements.includes(placement) || (rest && placement >= maxExplicit);

		const uniquePlacements = R.unique(standings.map((s) => s.placement));
		const placementNormalized = (placement: number) =>
			relevantMatchesFinished
				? uniquePlacements.indexOf(placement) + 1
				: placement;

		return {
			relevantMatchesFinished,
			teams: standings
				.filter((s) => matchesPlacement(placementNormalized(s.placement)))
				.map((s) => s.team.id),
		};
	}

	teamsWithNames(teams: { id: number }[]) {
		return teams.map((team) => {
			const name = this.tournament.ctx.teams.find(
				(participant) => participant.id === team.id,
			)?.name;
			invariant(name, `Team name not found for id: ${team.id}`);

			return {
				id: team.id,
				name,
			};
		});
	}

	/** Statuses of every match of the bracket, keyed by match id. */
	matchStatuses() {
		if (!this._matchStatuses) {
			this._matchStatuses = Engine.matchStatuses(this.data);
		}

		return this._matchStatuses;
	}

	/** Status of one match of the bracket. */
	matchStatus(matchId: number) {
		const status = this.matchStatuses().get(matchId);
		invariant(status, `Match not found: ${matchId}`);

		return status;
	}

	/** Matches with both teams defined, not completed and neither team busy in an earlier (lower number) match. */
	ongoingMatches(): number[] {
		const ongoingMatchIds: number[] = [];

		const teamsWithOngoingMatches = new Set<number>();

		for (const match of this.data.match.toSorted(
			(a, b) => a.number - b.number,
		)) {
			if (!match.opponent1?.id || !match.opponent2?.id) continue;
			if (match.winnerSide) {
				continue;
			}

			if (
				teamsWithOngoingMatches.has(match.opponent1.id) ||
				teamsWithOngoingMatches.has(match.opponent2.id)
			) {
				continue;
			}

			ongoingMatchIds.push(match.id);
			teamsWithOngoingMatches.add(match.opponent1.id);
			teamsWithOngoingMatches.add(match.opponent2.id);
		}

		return ongoingMatchIds;
	}

	abstract defaultRoundBestOfs(data: BracketData): BracketMapCounts;
}
