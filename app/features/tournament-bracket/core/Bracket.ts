import { sub } from "date-fns";
import type { Tables, TournamentStageSettings } from "~/db/tables";
import { TOURNAMENT } from "~/features/tournament";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { Round } from "~/modules/brackets-model";
import { removeDuplicates } from "~/utils/arrays";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";
import { cutToNDecimalPlaces } from "../../../utils/number";
import { fillWithNullTillPowerOfTwo } from "../tournament-bracket-utils";
import * as Progression from "./Progression";
import type { OptionalIdObject, Tournament } from "./Tournament";
import type { TournamentDataTeam } from "./Tournament.server";
import { getTournamentManager } from "./brackets-manager";
import type { BracketMapCounts } from "./toMapList";

interface CreateBracketArgs {
	id: number;
	/** Index of the bracket in the bracket progression */
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
	placement: number; // 1st, 2nd, 3rd, 4th, 5th, 5th...
	groupId?: number;
	stats?: {
		setWins: number;
		setLosses: number;
		mapWins: number;
		mapLosses: number;
		points: number;
		// first tiebreaker in round robin
		winsAgainstTied: number;
		// first tiebreaker in swiss
		lossesAgainstTied?: number;
		opponentSetWinPercentage?: number;
		opponentMapWinPercentage?: number;
	};
}

interface TeamTrackRecord {
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
				console.error("opponent1Seed or opponent2Seed not found");
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
		return removeDuplicates(
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

		// we need some number but does not matter what it is as the manager only contains one tournament
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

	source(_placements: number[]): {
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

	static create(
		args: CreateBracketArgs,
	): SingleEliminationBracket | DoubleEliminationBracket | RoundRobinBracket {
		switch (args.type) {
			case "single_elimination": {
				return new SingleEliminationBracket(args);
			}
			case "double_elimination": {
				return new DoubleEliminationBracket(args);
			}
			case "round_robin": {
				return new RoundRobinBracket(args);
			}
			case "swiss": {
				return new SwissBracket(args);
			}
			default: {
				assertUnreachable(args.type);
			}
		}
	}

	defaultRoundBestOfs(_data: TournamentManagerDataSet): BracketMapCounts {
		throw new Error("not implemented");
	}
}

class SingleEliminationBracket extends Bracket {
	get type(): Tables["TournamentStage"]["type"] {
		return "single_elimination";
	}

	defaultRoundBestOfs(data: TournamentManagerDataSet) {
		const result: BracketMapCounts = new Map();

		const maxRoundNumber = Math.max(...data.round.map((round) => round.number));
		for (const group of data.group) {
			const roundsOfGroup = data.round.filter(
				(round) => round.group_id === group.id,
			);

			const defaultOfRound = (round: Round) => {
				// 3rd place match
				if (group.number === 2) return 5;

				if (round.number > 2) return 5;

				// small brackets
				if (
					round.number === maxRoundNumber ||
					round.number === maxRoundNumber - 1
				) {
					return 5;
				}
				return 3;
			};

			for (const round of roundsOfGroup) {
				const atLeastOneNonByeMatch = data.match.some(
					(match) =>
						match.round_id === round.id && match.opponent1 && match.opponent2,
				);

				if (!atLeastOneNonByeMatch) continue;

				if (!result.get(group.id)) {
					result.set(group.id, new Map());
				}

				result
					.get(group.id)!
					.set(round.number, { count: defaultOfRound(round), type: "BEST_OF" });
			}
		}

		return result;
	}

	private hasThirdPlaceMatch() {
		return removeDuplicates(this.data.match.map((m) => m.group_id)).length > 1;
	}

	get standings(): Standing[] {
		const teams: { id: number; lostAt: number }[] = [];

		const matches = (() => {
			if (!this.hasThirdPlaceMatch()) {
				return this.data.match.slice();
			}

			const thirdPlaceMatch = this.data.match.find(
				(m) => m.group_id === Math.max(...this.data.group.map((g) => g.id)),
			);

			return this.data.match.filter(
				(m) => m.group_id !== thirdPlaceMatch?.group_id,
			);
		})();

		for (const match of matches.sort((a, b) => a.round_id - b.round_id)) {
			if (
				match.opponent1?.result !== "win" &&
				match.opponent2?.result !== "win"
			) {
				continue;
			}

			const loser =
				match.opponent1?.result === "win" ? match.opponent2 : match.opponent1;
			invariant(loser?.id, "Loser id not found");

			teams.push({ id: loser.id, lostAt: match.round_id });
		}

		const teamCountWhoDidntLoseYet =
			this.participantTournamentTeamIds.length - teams.length;

		const result: Standing[] = [];
		for (const roundId of removeDuplicates(teams.map((team) => team.lostAt))) {
			const teamsLostThisRound: { id: number }[] = [];
			while (teams.length && teams[0].lostAt === roundId) {
				teamsLostThisRound.push(teams.shift()!);
			}

			for (const { id: teamId } of teamsLostThisRound) {
				const team = this.tournament.teamById(teamId);
				invariant(team, `Team not found for id: ${teamId}`);

				const teamsPlacedAbove = teamCountWhoDidntLoseYet + teams.length;

				result.push({
					team,
					placement: teamsPlacedAbove + 1,
				});
			}
		}

		if (teamCountWhoDidntLoseYet === 1) {
			const winnerId = this.participantTournamentTeamIds.find((participantId) =>
				result.every(({ team }) => team.id !== participantId),
			);
			invariant(winnerId, "No winner identified");

			const winnerTeam = this.tournament.teamById(winnerId);
			invariant(winnerTeam, `Winner team not found for id: ${winnerId}`);

			result.push({
				team: winnerTeam,
				placement: 1,
			});
		}

		const thirdPlaceMatch = this.hasThirdPlaceMatch()
			? this.data.match.find((m) => m.group_id !== matches[0].group_id)
			: undefined;
		const thirdPlaceMatchWinner =
			thirdPlaceMatch?.opponent1?.result === "win"
				? thirdPlaceMatch.opponent1
				: thirdPlaceMatch?.opponent2?.result === "win"
					? thirdPlaceMatch.opponent2
					: undefined;

		const resultWithThirdPlaceTiebroken = result
			.map((standing) => {
				if (
					standing.placement === 3 &&
					thirdPlaceMatchWinner?.id !== standing.team.id
				) {
					return {
						...standing,
						placement: 4,
					};
				}
				return standing;
			})
			.sort((a, b) => a.placement - b.placement);

		return this.standingsWithoutNonParticipants(resultWithThirdPlaceTiebroken);
	}
}

class DoubleEliminationBracket extends Bracket {
	get type(): Tables["TournamentStage"]["type"] {
		return "double_elimination";
	}

	defaultRoundBestOfs(data: TournamentManagerDataSet) {
		const result: BracketMapCounts = new Map();

		for (const group of data.group) {
			const roundsOfGroup = data.round.filter(
				(round) => round.group_id === group.id,
			);

			const defaultOfRound = (round: Round) => {
				if (group.number === 3) return 5;
				if (group.number === 2) {
					const lastRoundNumber = Math.max(
						...roundsOfGroup.map((round) => round.number),
					);

					if (round.number === lastRoundNumber) return 5;
					return 3;
				}

				if (round.number > 2) return 5;
				return 3;
			};

			for (const round of roundsOfGroup) {
				const atLeastOneNonByeMatch = data.match.some(
					(match) =>
						match.round_id === round.id && match.opponent1 && match.opponent2,
				);

				if (!atLeastOneNonByeMatch) continue;

				if (!result.get(group.id)) {
					result.set(group.id, new Map());
				}

				result
					.get(group.id)!
					.set(round.number, { count: defaultOfRound(round), type: "BEST_OF" });
			}
		}

		return result;
	}

	winnersSourceRound(roundNumber: number) {
		const isMajorRound = roundNumber === 1 || roundNumber % 2 === 0;
		if (!isMajorRound) return;

		const roundNumberWB = Math.ceil((roundNumber + 1) / 2);

		const groupIdWB = this.data.group.find((g) => g.number === 1)?.id;

		return this.data.round.find(
			(round) => round.number === roundNumberWB && round.group_id === groupIdWB,
		);
	}

	get standings(): Standing[] {
		if (!this.enoughTeams) return [];

		const losersGroupId = this.data.group.find((g) => g.number === 2)?.id;

		const teams: { id: number; lostAt: number }[] = [];

		for (const match of this.data.match
			.slice()
			.sort((a, b) => a.round_id - b.round_id)) {
			if (match.group_id !== losersGroupId) continue;

			if (
				match.opponent1?.result !== "win" &&
				match.opponent2?.result !== "win"
			) {
				continue;
			}

			// BYE
			if (!match.opponent1 || !match.opponent2) continue;

			const loser =
				match.opponent1?.result === "win" ? match.opponent2 : match.opponent1;
			invariant(loser?.id, "Loser id not found");

			teams.push({ id: loser.id, lostAt: match.round_id });
		}

		const teamCountWhoDidntLoseInLosersYet =
			this.participantTournamentTeamIds.length - teams.length;

		const result: Standing[] = [];
		for (const roundId of removeDuplicates(teams.map((team) => team.lostAt))) {
			const teamsLostThisRound: { id: number }[] = [];
			while (teams.length && teams[0].lostAt === roundId) {
				teamsLostThisRound.push(teams.shift()!);
			}

			for (const { id: teamId } of teamsLostThisRound) {
				const team = this.tournament.teamById(teamId);
				invariant(team, `Team not found for id: ${teamId}`);

				const teamsPlacedAbove =
					teamCountWhoDidntLoseInLosersYet + teams.length;

				result.push({
					team,
					placement: teamsPlacedAbove + 1,
				});
			}
		}

		// edge case: 1 match only
		const noLosersRounds = !losersGroupId;
		const grandFinalsNumber = noLosersRounds ? 1 : 3;
		const grandFinalsGroupId = this.data.group.find(
			(g) => g.number === grandFinalsNumber,
		)?.id;
		invariant(grandFinalsGroupId, "GF group not found");
		const grandFinalMatches = this.data.match.filter(
			(match) => match.group_id === grandFinalsGroupId,
		);

		// if opponent1 won in DE it means that bracket reset is not played
		if (
			grandFinalMatches[0].opponent1 &&
			(noLosersRounds || grandFinalMatches[0].opponent1.result === "win")
		) {
			const loser =
				grandFinalMatches[0].opponent1.result === "win"
					? "opponent2"
					: "opponent1";
			const winner = loser === "opponent1" ? "opponent2" : "opponent1";

			const loserTeam = this.tournament.teamById(
				grandFinalMatches[0][loser]!.id!,
			);
			invariant(loserTeam, "Loser team not found");
			const winnerTeam = this.tournament.teamById(
				grandFinalMatches[0][winner]!.id!,
			);
			invariant(winnerTeam, "Winner team not found");

			result.push({
				team: loserTeam,
				placement: 2,
			});

			result.push({
				team: winnerTeam,
				placement: 1,
			});
		} else if (
			grandFinalMatches[1].opponent1?.result === "win" ||
			grandFinalMatches[1].opponent2?.result === "win"
		) {
			const loser =
				grandFinalMatches[1].opponent1?.result === "win"
					? "opponent2"
					: "opponent1";
			const winner = loser === "opponent1" ? "opponent2" : "opponent1";

			const loserTeam = this.tournament.teamById(
				grandFinalMatches[1][loser]!.id!,
			);
			invariant(loserTeam, "Loser team not found");
			const winnerTeam = this.tournament.teamById(
				grandFinalMatches[1][winner]!.id!,
			);
			invariant(winnerTeam, "Winner team not found");

			result.push({
				team: loserTeam,
				placement: 2,
			});

			result.push({
				team: winnerTeam,
				placement: 1,
			});
		}

		return this.standingsWithoutNonParticipants(result.reverse());
	}

	get everyMatchOver() {
		if (this.preview) return false;

		let lastWinner = -1;
		for (const [i, match] of this.data.match.entries()) {
			// special case - bracket reset might not be played depending on who wins in the grands
			const isLast = i === this.data.match.length - 1;
			if (isLast && lastWinner === 1) {
				continue;
			}
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

			lastWinner = match.opponent1?.result === "win" ? 1 : 2;
		}

		return true;
	}

	source(placements: number[]) {
		const resolveLosersGroupId = (data: TournamentManagerDataSet) => {
			const minGroupId = Math.min(...data.round.map((round) => round.group_id));

			return minGroupId + 1;
		};
		const placementsToRoundsIds = (
			data: TournamentManagerDataSet,
			losersGroupId: number,
		) => {
			const firstRoundIsOnlyByes = () => {
				const losersMatches = data.match.filter(
					(match) => match.group_id === losersGroupId,
				);

				const fistRoundId = Math.min(...losersMatches.map((m) => m.round_id));

				const firstRoundMatches = losersMatches.filter(
					(match) => match.round_id === fistRoundId,
				);

				return firstRoundMatches.every(
					(match) => match.opponent1 === null || match.opponent2 === null,
				);
			};

			const losersRounds = data.round.filter(
				(round) => round.group_id === losersGroupId,
			);
			const orderedRoundsIds = losersRounds
				.map((round) => round.id)
				.sort((a, b) => a - b);
			const amountOfRounds =
				Math.abs(Math.min(...placements)) + (firstRoundIsOnlyByes() ? 1 : 0);

			return orderedRoundsIds.slice(0, amountOfRounds);
		};

		invariant(
			placements.every((placement) => placement < 0),
			"Positive placements in DE not implemented",
		);

		const losersGroupId = resolveLosersGroupId(this.data);
		const sourceRoundsIds = placementsToRoundsIds(
			this.data,
			losersGroupId,
		).sort(
			// teams who made it further in the bracket get higher seed
			(a, b) => b - a,
		);

		const teams: number[] = [];
		let relevantMatchesFinished = true;
		for (const roundId of sourceRoundsIds) {
			const roundsMatches = this.data.match.filter(
				(match) => match.round_id === roundId,
			);

			for (const match of roundsMatches) {
				// BYE
				if (!match.opponent1 || !match.opponent2) {
					continue;
				}
				if (
					match.opponent1?.result !== "win" &&
					match.opponent2?.result !== "win"
				) {
					relevantMatchesFinished = false;
					continue;
				}

				const loser =
					match.opponent1?.result === "win" ? match.opponent2 : match.opponent1;
				invariant(loser?.id, "Loser id not found");

				teams.push(loser.id);
			}
		}

		return {
			relevantMatchesFinished,
			teams,
		};
	}
}

class RoundRobinBracket extends Bracket {
	get collectResultsWithPoints() {
		return true;
	}

	source(placements: number[]): {
		relevantMatchesFinished: boolean;
		teams: number[];
	} {
		if (placements.some((p) => p < 0)) {
			throw new Error("Negative placements not implemented");
		}
		const standings = this.standings;
		const relevantMatchesFinished =
			standings.length === this.participantTournamentTeamIds.length;

		const uniquePlacements = removeDuplicates(
			standings.map((s) => s.placement),
		);

		// 1,3,5 -> 1,2,3 e.g.
		const placementNormalized = (p: number) => {
			return uniquePlacements.indexOf(p) + 1;
		};

		return {
			relevantMatchesFinished,
			teams: standings
				.filter((s) => placements.includes(placementNormalized(s.placement)))
				.map((s) => s.team.id),
		};
	}

	get standings(): Standing[] {
		return this.currentStandings();
	}

	currentStandings(includeUnfinishedGroups = false) {
		const groupIds = this.data.group.map((group) => group.id);

		const placements: (Standing & { groupId: number })[] = [];
		for (const groupId of groupIds) {
			const matches = this.data.match.filter(
				(match) => match.group_id === groupId,
			);

			const groupIsFinished = matches.every(
				(match) =>
					// BYE
					match.opponent1 === null ||
					match.opponent2 === null ||
					// match was played out
					match.opponent1?.result === "win" ||
					match.opponent2?.result === "win",
			);

			if (!groupIsFinished && !includeUnfinishedGroups) continue;

			const teams: {
				id: number;
				setWins: number;
				setLosses: number;
				mapWins: number;
				mapLosses: number;
				winsAgainstTied: number;
				points: number;
			}[] = [];

			const updateTeam = ({
				teamId,
				setWins,
				setLosses,
				mapWins,
				mapLosses,
				points,
			}: {
				teamId: number;
				setWins: number;
				setLosses: number;
				mapWins: number;
				mapLosses: number;
				points: number;
			}) => {
				const team = teams.find((team) => team.id === teamId);
				if (team) {
					team.setWins += setWins;
					team.setLosses += setLosses;
					team.mapWins += mapWins;
					team.mapLosses += mapLosses;
					team.points += points;
				} else {
					teams.push({
						id: teamId,
						setWins,
						setLosses,
						mapWins,
						mapLosses,
						winsAgainstTied: 0,
						points,
					});
				}
			};

			for (const match of matches) {
				if (
					match.opponent1?.result !== "win" &&
					match.opponent2?.result !== "win"
				) {
					continue;
				}

				const winner =
					match.opponent1?.result === "win" ? match.opponent1 : match.opponent2;

				const loser =
					match.opponent1?.result === "win" ? match.opponent2 : match.opponent1;

				if (!winner || !loser) continue;

				invariant(
					typeof winner.id === "number" &&
						typeof loser.id === "number" &&
						typeof winner.score === "number" &&
						typeof loser.score === "number",
					"RoundRobinBracket.standings: winner or loser id not found",
				);

				if (
					typeof winner.totalPoints !== "number" ||
					typeof loser.totalPoints !== "number"
				) {
					logger.warn(
						"RoundRobinBracket.standings: winner or loser points not found",
					);
				}

				updateTeam({
					teamId: winner.id,
					setWins: 1,
					setLosses: 0,
					mapWins: winner.score,
					mapLosses: loser.score,
					points: winner.totalPoints ?? 0,
				});
				updateTeam({
					teamId: loser.id,
					setWins: 0,
					setLosses: 1,
					mapWins: loser.score,
					mapLosses: winner.score,
					points: loser.totalPoints ?? 0,
				});
			}

			for (const team of teams) {
				for (const team2 of teams) {
					if (team.id === team2.id) continue;
					if (team.setWins !== team2.setWins) continue;

					// they are different teams and are tied, let's check who won

					const wonTheirMatch = matches.some(
						(match) =>
							(match.opponent1?.id === team.id &&
								match.opponent2?.id === team2.id &&
								match.opponent1?.result === "win") ||
							(match.opponent1?.id === team2.id &&
								match.opponent2?.id === team.id &&
								match.opponent2?.result === "win"),
					);

					if (wonTheirMatch) {
						team.winsAgainstTied++;
					}
				}
			}

			placements.push(
				...teams
					.sort((a, b) => {
						if (a.setWins > b.setWins) return -1;
						if (a.setWins < b.setWins) return 1;

						if (a.winsAgainstTied > b.winsAgainstTied) return -1;
						if (a.winsAgainstTied < b.winsAgainstTied) return 1;

						if (a.mapWins > b.mapWins) return -1;
						if (a.mapWins < b.mapWins) return 1;

						if (a.mapLosses < b.mapLosses) return -1;
						if (a.mapLosses > b.mapLosses) return 1;

						if (a.points > b.points) return -1;
						if (a.points < b.points) return 1;

						const aSeed = Number(this.tournament.teamById(a.id)?.seed);
						const bSeed = Number(this.tournament.teamById(b.id)?.seed);

						if (aSeed < bSeed) return -1;
						if (aSeed > bSeed) return 1;

						return 0;
					})
					.map((team, i) => {
						return {
							team: this.tournament.teamById(team.id)!,
							placement: i + 1,
							groupId,
							stats: {
								setWins: team.setWins,
								setLosses: team.setLosses,
								mapWins: team.mapWins,
								mapLosses: team.mapLosses,
								points: team.points,
								winsAgainstTied: team.winsAgainstTied,
							},
						};
					}),
			);
		}

		const sorted = placements.sort((a, b) => {
			if (a.placement < b.placement) return -1;
			if (a.placement > b.placement) return 1;

			if (a.groupId < b.groupId) return -1;
			if (a.groupId > b.groupId) return 1;

			return 0;
		});

		let lastPlacement = 0;
		let currentPlacement = 1;
		let teamsEncountered = 0;
		return this.standingsWithoutNonParticipants(
			sorted.map((team) => {
				if (team.placement !== lastPlacement) {
					lastPlacement = team.placement;
					currentPlacement = teamsEncountered + 1;
				}
				teamsEncountered++;
				return {
					...team,
					placement: currentPlacement,
					stats: team.stats,
				};
			}),
		);
	}

	get type(): Tables["TournamentStage"]["type"] {
		return "round_robin";
	}

	defaultRoundBestOfs(data: TournamentManagerDataSet) {
		const result: BracketMapCounts = new Map();

		for (const round of data.round) {
			if (!result.get(round.group_id)) {
				result.set(round.group_id, new Map());
			}

			result
				.get(round.group_id)!
				.set(round.number, { count: 3, type: "BEST_OF" });
		}

		return result;
	}
}

class SwissBracket extends Bracket {
	get collectResultsWithPoints() {
		return false;
	}

	source(placements: number[]): {
		relevantMatchesFinished: boolean;
		teams: number[];
	} {
		if (placements.some((p) => p < 0)) {
			throw new Error("Negative placements not implemented");
		}
		const standings = this.standings;
		const relevantMatchesFinished = this.data.round.every((round) => {
			const roundsMatches = this.data.match.filter(
				(match) => match.round_id === round.id,
			);

			// some round has not started yet
			if (roundsMatches.length === 0) return false;

			return roundsMatches.every((match) => {
				if (
					match.opponent1 &&
					match.opponent2 &&
					match.opponent1?.result !== "win" &&
					match.opponent2?.result !== "win"
				) {
					return false;
				}

				return true;
			});
		});

		const uniquePlacements = removeDuplicates(
			standings.map((s) => s.placement),
		);

		// 1,3,5 -> 1,2,3 e.g.
		const placementNormalized = (p: number) => {
			return uniquePlacements.indexOf(p) + 1;
		};

		return {
			relevantMatchesFinished,
			teams: standings
				.filter((s) => placements.includes(placementNormalized(s.placement)))
				.map((s) => s.team.id),
		};
	}

	get standings(): Standing[] {
		return this.currentStandings();
	}

	currentStandings(includeUnfinishedGroups = false) {
		const groupIds = this.data.group.map((group) => group.id);

		const placements: (Standing & { groupId: number })[] = [];
		for (const groupId of groupIds) {
			const matches = this.data.match.filter(
				(match) => match.group_id === groupId,
			);

			const groupIsFinished = matches.every(
				(match) =>
					// BYE
					match.opponent1 === null ||
					match.opponent2 === null ||
					// match was played out
					match.opponent1?.result === "win" ||
					match.opponent2?.result === "win",
			);

			if (!groupIsFinished && !includeUnfinishedGroups) continue;

			const teams: {
				id: number;
				setWins: number;
				setLosses: number;
				mapWins: number;
				mapLosses: number;
				winsAgainstTied: number;
				lossesAgainstTied: number;
				opponentSets: TeamTrackRecord;
				opponentMaps: TeamTrackRecord;
			}[] = [];

			const updateTeam = ({
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
			}) => {
				const team = teams.find((team) => team.id === teamId);
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
			};

			const matchUps = new Map<number, number[]>();

			for (const match of matches) {
				if (match.opponent1?.id && match.opponent2?.id) {
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

				if (
					match.opponent1?.result !== "win" &&
					match.opponent2?.result !== "win"
				) {
					continue;
				}

				const winner =
					match.opponent1?.result === "win" ? match.opponent1 : match.opponent2;

				const loser =
					match.opponent1?.result === "win" ? match.opponent2 : match.opponent1;

				if (!winner || !loser) continue;

				invariant(
					typeof winner.id === "number" &&
						typeof loser.id === "number" &&
						typeof winner.score === "number" &&
						typeof loser.score === "number",
					"RoundRobinBracket.standings: winner or loser id not found",
				);

				updateTeam({
					teamId: winner.id,
					setWins: 1,
					setLosses: 0,
					mapWins: winner.score,
					mapLosses: loser.score,
				});
				updateTeam({
					teamId: loser.id,
					setWins: 0,
					setLosses: 1,
					mapWins: loser.score,
					mapLosses: winner.score,
				});
			}

			// BYES
			for (const match of matches) {
				if (match.opponent1 && match.opponent2) {
					continue;
				}

				const winner = match.opponent1 ? match.opponent1 : match.opponent2;

				if (!winner?.id) {
					logger.warn("SwissBracket.currentStandings: winner not found");
					continue;
				}

				const round = this.data.round.find(
					(round) => round.id === match.round_id,
				);
				const mapWins =
					round?.maps?.type === "PLAY_ALL"
						? round?.maps?.count
						: Math.ceil((round?.maps?.count ?? 0) / 2);
				// preview
				if (!mapWins) {
					continue;
				}

				updateTeam({
					teamId: winner.id,
					setWins: 1,
					setLosses: 0,
					mapWins: mapWins,
					mapLosses: 0,
				});
			}

			// opponent win %
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
						logger.warn("SwissBracket.currentStandings: opponent not found", {
							teamId,
						});
						continue;
					}

					opponentSets.wins += opponent.setWins;
					opponentSets.losses += opponent.setLosses;

					opponentMaps.wins += opponent.mapWins;
					opponentMaps.losses += opponent.mapLosses;
				}

				updateTeam({
					teamId: team.id,
					opponentSets,
					opponentMaps,
				});
			}

			// wins against tied
			for (const team of teams) {
				for (const team2 of teams) {
					if (team.id === team2.id) continue;
					if (
						team.setWins !== team2.setWins ||
						// check also set losses to account for dropped teams
						team.setLosses !== team2.setLosses
					) {
						continue;
					}

					// they are different teams and are tied, let's check who won

					const finishedMatchBetweenTeams = matches.find((match) => {
						const isBetweenTeams =
							(match.opponent1?.id === team.id &&
								match.opponent2?.id === team2.id) ||
							(match.opponent1?.id === team2.id &&
								match.opponent2?.id === team.id);

						const isFinished =
							match.opponent1?.result === "win" ||
							match.opponent2?.result === "win";

						return isBetweenTeams && isFinished;
					});

					// they did not play each other
					if (!finishedMatchBetweenTeams) continue;

					const wonTheirMatch =
						(finishedMatchBetweenTeams.opponent1!.id === team.id &&
							finishedMatchBetweenTeams.opponent1!.result === "win") ||
						(finishedMatchBetweenTeams.opponent2!.id === team.id &&
							finishedMatchBetweenTeams.opponent2!.result === "win");

					if (wonTheirMatch) {
						team.winsAgainstTied++;
					} else {
						team.lossesAgainstTied++;
					}
				}
			}

			const droppedOutTeams = this.tournament.ctx.teams
				.filter((t) => t.droppedOut)
				.map((t) => t.id);
			placements.push(
				...teams
					.sort((a, b) => {
						const aDroppedOut = droppedOutTeams.includes(a.id);
						const bDroppedOut = droppedOutTeams.includes(b.id);

						if (aDroppedOut && !bDroppedOut) return 1;
						if (!aDroppedOut && bDroppedOut) return -1;

						if (a.setWins > b.setWins) return -1;
						if (a.setWins < b.setWins) return 1;

						if (a.lossesAgainstTied > b.lossesAgainstTied) return 1;
						if (a.lossesAgainstTied < b.lossesAgainstTied) return -1;

						const aOpponentSetWinPercentage = this.trackRecordToWinPercentage(
							a.opponentSets,
						);
						const bOpponentSetWinPercentage = this.trackRecordToWinPercentage(
							b.opponentSets,
						);

						if (aOpponentSetWinPercentage > bOpponentSetWinPercentage) {
							return -1;
						}
						if (aOpponentSetWinPercentage < bOpponentSetWinPercentage) return 1;

						const aOpponentMapWinPercentage = this.trackRecordToWinPercentage(
							a.opponentMaps,
						);
						const bOpponentMapWinPercentage = this.trackRecordToWinPercentage(
							b.opponentMaps,
						);

						if (aOpponentMapWinPercentage > bOpponentMapWinPercentage) {
							return -1;
						}
						if (aOpponentMapWinPercentage < bOpponentMapWinPercentage) return 1;

						if (a.mapWins > b.mapWins) return -1;
						if (a.mapWins < b.mapWins) return 1;

						if (a.mapLosses < b.mapLosses) return -1;
						if (a.mapLosses > b.mapLosses) return 1;

						const aSeed = Number(this.tournament.teamById(a.id)?.seed);
						const bSeed = Number(this.tournament.teamById(b.id)?.seed);

						if (aSeed < bSeed) return -1;
						if (aSeed > bSeed) return 1;

						return 0;
					})
					.map((team, i) => {
						return {
							team: this.tournament.teamById(team.id)!,
							placement: i + 1,
							groupId,
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
								points: 0,
							},
						};
					}),
			);
		}

		const sorted = placements.sort((a, b) => {
			if (a.placement < b.placement) return -1;
			if (a.placement > b.placement) return 1;

			if (a.groupId < b.groupId) return -1;
			if (a.groupId > b.groupId) return 1;

			return 0;
		});

		let lastPlacement = 0;
		let currentPlacement = 1;
		let teamsEncountered = 0;
		return this.standingsWithoutNonParticipants(
			sorted.map((team) => {
				if (team.placement !== lastPlacement) {
					lastPlacement = team.placement;
					currentPlacement = teamsEncountered + 1;
				}
				teamsEncountered++;
				return {
					...team,
					placement: currentPlacement,
					stats: team.stats,
				};
			}),
		);
	}

	private trackRecordToWinPercentage(trackRecord: TeamTrackRecord) {
		return cutToNDecimalPlaces(
			(trackRecord.wins / (trackRecord.wins + trackRecord.losses)) * 100,
			2,
		);
	}

	get type(): Tables["TournamentStage"]["type"] {
		return "swiss";
	}

	defaultRoundBestOfs(data: TournamentManagerDataSet) {
		const result: BracketMapCounts = new Map();

		for (const round of data.round) {
			if (!result.get(round.group_id)) {
				result.set(round.group_id, new Map());
			}

			result
				.get(round.group_id)!
				.set(round.number, { count: 3, type: "BEST_OF" });
		}

		return result;
	}
}
