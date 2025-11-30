import { sub } from "date-fns";
import * as R from "remeda";
import type { Tables, TournamentStageSettings } from "~/db/tables";
import { TOURNAMENT } from "~/features/tournament/tournament-constants";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { Round } from "~/modules/brackets-model";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { fillWithNullTillPowerOfTwo } from "../../tournament-bracket-utils";
import { getTournamentManager } from "../brackets-manager";
import * as Progression from "../Progression";
import type { OptionalIdObject, Tournament } from "../Tournament";
import type { TournamentDataTeam } from "../Tournament.server";
import type { BracketMapCounts } from "../toMapList";

export interface CreateBracketArgs {
	id: number;
	idx: number;
	preview: boolean;
	data?: TournamentManagerDataSet;
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
		points: number;
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
	simulatedData: TournamentManagerDataSet | undefined;
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
			const manager = getTournamentManager();

			manager.import(this.data);

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

				for (const match of manager.export().match) {
					if (!match) continue;
					// we have a result already
					if (
						match.opponent1?.result === "win" ||
						match.opponent2?.result === "win"
					) {
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

					manager.update.match({
						id: match.id,
						opponent1: {
							score: winner === 1 ? 1 : 0,
							result: winner === 1 ? "win" : undefined,
						},
						opponent2: {
							score: winner === 2 ? 1 : 0,
							result: winner === 2 ? "win" : undefined,
						},
					});
				}
			}

			this.simulatedData = manager.export();
		} catch (e) {
			logger.error("Bracket.createdSimulation: ", e);
		}
	}

	private teamOrderForSimulation() {
		const result = new Map(this.tournament.ctx.teams.map((t, i) => [t.id, i]));

		for (const match of this.data.match) {
			if (
				!match.opponent1?.id ||
				!match.opponent2?.id ||
				(match.opponent1?.result !== "win" && match.opponent2?.result !== "win")
			) {
				continue;
			}

			const opponent1Seed = result.get(match.opponent1.id) ?? -1;
			const opponent2Seed = result.get(match.opponent2.id) ?? -1;
			if (opponent1Seed === -1 || opponent2Seed === -1) {
				logger.error("opponent1Seed or opponent2Seed not found");
				continue;
			}

			if (opponent1Seed < opponent2Seed && match.opponent1?.result === "win") {
				continue;
			}

			if (opponent2Seed < opponent1Seed && match.opponent2?.result === "win") {
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

		return this.simulatedData.match
			.filter(Boolean)
			.find((match) => match.id === matchId);
	}

	get collectResultsWithPoints() {
		return false;
	}

	get type(): Tables["TournamentStage"]["type"] {
		throw new Error("not implemented");
	}

	get standings(): Standing[] {
		throw new Error("not implemented");
	}

	get participantTournamentTeamIds() {
		return R.unique(
			this.data.match
				.flatMap((match) => [match.opponent1?.id, match.opponent2?.id])
				.filter(Boolean),
		) as number[];
	}

	currentStandings(_includeUnfinishedGroups: boolean) {
		return this.standings;
	}

	winnersSourceRound(_roundNumber: number): Round | undefined {
		return;
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

	generateMatchesData(teams: number[]) {
		const manager = getTournamentManager();

		const virtualTournamentId = 1;

		if (teams.length >= TOURNAMENT.ENOUGH_TEAMS_TO_START) {
			manager.create({
				tournamentId: virtualTournamentId,
				name: "Virtual",
				type: this.type,
				seeding:
					this.type === "round_robin"
						? teams
						: fillWithNullTillPowerOfTwo(teams),
				settings: this.tournament.bracketManagerSettings(
					this.settings,
					this.type,
					teams.length,
				),
			});
		}

		return manager.get.tournamentData(virtualTournamentId);
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

	get everyMatchOver() {
		if (this.preview) return false;

		for (const match of this.data.match) {
			// BYE
			if (match.opponent1 === null || match.opponent2 === null) {
				continue;
			}
			if (
				match.opponent1?.result !== "win" &&
				match.opponent2?.result !== "win"
			) {
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

		const team = this.tournament.ownedTeamByUser(user);
		if (!team) return false;

		return this.teamsPendingCheckIn.includes(team.id);
	}

	source(_options: { placements: number[]; advanceThreshold?: number }): {
		relevantMatchesFinished: boolean;
		teams: number[];
	} {
		throw new Error("not implemented");
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
			if (
				match.opponent1.result === "win" ||
				match.opponent2.result === "win"
			) {
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

	defaultRoundBestOfs(_data: TournamentManagerDataSet): BracketMapCounts {
		throw new Error("not implemented");
	}
}
