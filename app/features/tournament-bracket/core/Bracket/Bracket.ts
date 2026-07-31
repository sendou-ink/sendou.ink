import { sub } from "date-fns";
import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type { TournamentStageSettings } from "~/db/tables-json";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import type {
	BracketData,
	RoundData,
} from "~/features/tournament-bracket/core/engine/types";
import invariant from "~/utils/invariant";
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
	canBeStarted?: boolean;
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

export interface TeamTrackRecord {
	wins: number;
	losses: number;
}

export abstract class Bracket {
	id;
	idx;
	preview;
	data;
	simulatedData: BracketData | undefined;
	canBeStarted;
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

	constructor({
		id,
		idx,
		preview,
		data,
		canBeStarted,
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
		this.canBeStarted = canBeStarted;
		this.name = name;
		this.teamsPendingCheckIn = teamsPendingCheckIn;
		this.sources = sources;
		this.createdAt = createdAt;
		this.requiresCheckIn = requiresCheckIn;
		this.startTime = startTime;

		if (this.tournament.simulateBrackets) {
			this.createdSimulation();
		}
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
						const isBracketReset =
							this.type === "double_elimination" &&
							match.id === this.data.match[this.data.match.length - 1].id;

						if (!isBracketReset) {
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

			this.simulatedData = data;
		} catch (e) {
			logger.error("Bracket.createdSimulation: ", e);
		}
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

	/**
	 * Standings that are settled i.e. teams still playing are left out. Safe to
	 * use for deciding who advances to another bracket.
	 */
	abstract get standings(): Standing[];

	/**
	 * How many rounds a swiss bracket has. Comes from the bracket's own stage
	 * settings rather than `settings` (the progression's, editable at any time),
	 * so it can't drift from the bracket that actually exists.
	 */
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

	/**
	 * Standings including teams that are still playing. Meant for displaying the
	 * bracket's current state, not for deciding who advances.
	 */
	get liveStandings(): Standing[] {
		return this.standings;
	}

	winnersSourceRound(_roundNumber: number): RoundData | undefined {
		return;
	}

	/** Returns true if this bracket is a starting bracket (i.e., teams in it start their tournament from this bracket). Note: there can be more than one starting bracket. */
	get isStartingBracket() {
		return !this.sources || this.sources.length === 0;
	}

	protected standingsWithoutNonParticipants(standings: Standing[]): Standing[] {
		return standings.map((standing) => {
			return {
				...standing,
				team: {
					...standing.team,
					members: standing.team.members.filter((member) =>
						this.tournament.ctx.participatedUsers.includes(member.userId),
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
				independentRounds: this.tournament.isLeagueDivision,
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
			}).isOk()
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
			}).isOk()
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

	/**
	 * Whether the standings of this bracket are final i.e. no further match can
	 * change them. While false the standings are provisional.
	 */
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
		// using regular check-in
		if (!this.teamsPendingCheckIn) return false;

		if (this.startTime) {
			const checkInOpen =
				sub(this.startTime.getTime(), { hours: 1 }).getTime() < Date.now() &&
				this.startTime.getTime() > Date.now();

			if (!checkInOpen) return false;
		}

		const team = this.tournament.teamMemberOfByUser(user);
		if (!team) return false;

		return this.teamsPendingCheckIn.includes(team.id);
	}

	abstract source(options: {
		placements: number[];
		advanceThreshold?: number;
		rest?: boolean;
	}): {
		relevantMatchesFinished: boolean;
		teams: number[];
	};

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

	/**
	 * Returns match IDs that are currently ongoing (ready to start).
	 * A match is ongoing when:
	 * - Both teams are defined
	 * - No team has an earlier match (lower number) currently in progress
	 * - Match is not completed
	 */
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
