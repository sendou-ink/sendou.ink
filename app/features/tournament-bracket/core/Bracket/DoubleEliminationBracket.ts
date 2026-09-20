import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type {
	BracketData,
	RoundData,
} from "~/features/tournament-bracket/core/engine/types";
import { invariant } from "~/utils/invariant";
import { type BracketMapCounts, roundSetKey } from "../toMapList";
import { Bracket, type Standing } from "./Bracket";
import { cumulativeEliminationsByRound } from "./utils";

export class DoubleEliminationBracket extends Bracket {
	get type(): Tables["TournamentStage"]["type"] {
		return "double_elimination";
	}

	defaultRoundBestOfs(data: BracketData) {
		const result: BracketMapCounts = new Map();

		const lastLosersRoundNumber = Math.max(
			...data.round
				.filter((round) => round.section === "losers")
				.map((round) => round.number),
		);
		const defaultOfRound = (round: RoundData) => {
			if (round.section === "finals") return 5;
			if (round.section === "losers") {
				if (round.number === lastLosersRoundNumber) return 5;
				return 3;
			}

			if (round.number > 2) return 5;
			return 3;
		};

		for (const round of data.round) {
			const atLeastOneNonByeMatch = data.match.some(
				(match) =>
					match.roundId === round.id && match.opponent1 && match.opponent2,
			);

			if (!atLeastOneNonByeMatch) continue;

			const key = roundSetKey(round);
			if (!result.get(key)) {
				result.set(key, new Map());
			}

			result
				.get(key)!
				.set(round.number, { count: defaultOfRound(round), type: "BEST_OF" });
		}

		return result;
	}

	winnersSourceRound(roundNumber: number) {
		const isMajorRound = roundNumber === 1 || roundNumber % 2 === 0;
		if (!isMajorRound) return;

		const roundNumberWB = Math.ceil((roundNumber + 1) / 2);

		return this.data.round.find(
			(round) => round.number === roundNumberWB && round.section === "winners",
		);
	}

	private matchesOfSection(section: RoundData["section"]) {
		const roundIds = new Set(
			this.data.round
				.filter((round) => round.section === section)
				.map((round) => round.id),
		);

		return this.data.match.filter((match) => roundIds.has(match.roundId));
	}

	protected calculateStandings(): Standing[] {
		if (!this.enoughTeams) return [];

		const losersMatches = this.matchesOfSection("losers").sort(
			(a, b) => a.roundId - b.roundId,
		);

		const teams: { id: number; lostAt: number }[] = [];

		for (const match of losersMatches) {
			if (!match.winnerSide) {
				continue;
			}

			// BYE
			if (!match.opponent1 || !match.opponent2) continue;

			const loser =
				match.winnerSide === "opponent1" ? match.opponent2 : match.opponent1;
			invariant(loser?.id, "Loser id not found");

			teams.push({ id: loser.id, lostAt: match.roundId });
		}

		const eliminationsThroughLosersRound =
			cumulativeEliminationsByRound(losersMatches);

		const result: Standing[] = [];
		for (const roundId of R.unique(teams.map((team) => team.lostAt))) {
			const teamsLostThisRound: { id: number }[] = [];
			while (teams.length && teams[0].lostAt === roundId) {
				teamsLostThisRound.push(teams.shift()!);
			}

			const placement =
				this.participantTournamentTeamIds.length -
				eliminationsThroughLosersRound.get(roundId)! +
				1;

			for (const { id: teamId } of teamsLostThisRound) {
				const team = this.tournament.teamById(teamId);
				invariant(team, `Team not found for id: ${teamId}`);

				result.push({
					team,
					placement,
				});
			}
		}

		// edge case: 1 match only, the winners bracket final is the grand final
		const noLosersRounds = losersMatches.length === 0;
		const grandFinalMatches = this.matchesOfSection(
			noLosersRounds ? "winners" : "finals",
		);
		invariant(grandFinalMatches.length > 0, "GF matches not found");

		// if opponent1 won in DE it means that bracket reset is not played
		if (
			grandFinalMatches[0].opponent1 &&
			grandFinalMatches[0].winnerSide &&
			(noLosersRounds || grandFinalMatches[0].winnerSide === "opponent1")
		) {
			const loser =
				grandFinalMatches[0].winnerSide === "opponent1"
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
		} else if (grandFinalMatches[1]?.winnerSide) {
			const loser =
				grandFinalMatches[1].winnerSide === "opponent1"
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
			if (!match.winnerSide) {
				return false;
			}

			lastWinner = match.winnerSide === "opponent1" ? 1 : 2;
		}

		return true;
	}

	source({ placements, rest }: { placements: number[]; rest?: boolean }) {
		invariant(placements.length > 0, "Empty placements not supported");
		invariant(
			placements.every((placement) => placement < 0) ||
				placements.every((placement) => placement > 0),
			"Mixed positive and negative placements not supported",
		);

		if (placements.every((placement) => placement > 0)) {
			return this.sourceByStandings(placements, rest === true);
		}

		const placementsToRoundsIds = () => {
			const firstRoundIsOnlyByes = () => {
				const losersMatches = this.matchesOfSection("losers");

				const fistRoundId = Math.min(...losersMatches.map((m) => m.roundId));

				const firstRoundMatches = losersMatches.filter(
					(match) => match.roundId === fistRoundId,
				);

				return firstRoundMatches.every(
					(match) => match.opponent1 === null || match.opponent2 === null,
				);
			};

			const losersRounds = this.data.round.filter(
				(round) => round.section === "losers",
			);
			const orderedRoundsIds = losersRounds
				.map((round) => round.id)
				.sort((a, b) => a - b);
			const amountOfRounds =
				Math.abs(Math.min(...placements)) + (firstRoundIsOnlyByes() ? 1 : 0);

			return orderedRoundsIds.slice(0, amountOfRounds);
		};

		const sourceRoundsIds = placementsToRoundsIds().sort(
			// teams who made it further in the bracket get higher seed
			(a, b) => b - a,
		);

		const teams: number[] = [];
		let relevantMatchesFinished = true;
		for (const roundId of sourceRoundsIds) {
			const roundsMatches = this.data.match.filter(
				(match) => match.roundId === roundId,
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
}
