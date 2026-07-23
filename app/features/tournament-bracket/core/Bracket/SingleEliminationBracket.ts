import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type {
	Round,
	TournamentManagerDataSet,
} from "~/features/tournament-bracket/core/engine/types";
import invariant from "~/utils/invariant";
import type { BracketMapCounts } from "../toMapList";
import { Bracket, type Standing } from "./Bracket";
import { cumulativeEliminationsByRound } from "./utils";

export class SingleEliminationBracket extends Bracket {
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
		return R.unique(this.data.match.map((m) => m.group_id)).length > 1;
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

		const eliminationsThroughRound = cumulativeEliminationsByRound(matches);

		const result: Standing[] = [];
		for (const roundId of R.unique(teams.map((team) => team.lostAt))) {
			const teamsLostThisRound: { id: number }[] = [];
			while (teams.length && teams[0].lostAt === roundId) {
				teamsLostThisRound.push(teams.shift()!);
			}

			const placement =
				this.participantTournamentTeamIds.length -
				eliminationsThroughRound.get(roundId)! +
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
			.flatMap((standing) => {
				if (standing.placement !== 3 || !thirdPlaceMatch) return [standing];
				// semifinal losers have not finished their run before the third place match is played
				if (!thirdPlaceMatchWinner) return [];
				if (thirdPlaceMatchWinner.id !== standing.team.id) {
					return [{ ...standing, placement: 4 }];
				}
				return [standing];
			})
			.sort((a, b) => a.placement - b.placement);

		return this.standingsWithoutNonParticipants(resultWithThirdPlaceTiebroken);
	}

	source({ placements }: { placements: number[] }) {
		invariant(placements.length > 0, "Empty placements not supported");
		invariant(
			placements.every((placement) => placement < 0),
			"Positive placements in SE not implemented",
		);

		// third place match lives in a separate (higher) group; the winners
		// group teams get eliminated from is the lowest group id
		const mainGroupId = Math.min(...this.data.group.map((group) => group.id));

		const orderedRoundsIds = this.data.round
			.filter((round) => round.group_id === mainGroupId)
			.map((round) => round.id)
			.sort((a, b) => a - b);

		const amountOfRounds = Math.abs(Math.min(...placements));

		const sourceRoundsIds = orderedRoundsIds.slice(0, amountOfRounds).sort(
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
