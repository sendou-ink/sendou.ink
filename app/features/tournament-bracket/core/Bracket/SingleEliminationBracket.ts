import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import type { Round } from "~/modules/brackets-model";
import invariant from "~/utils/invariant";
import type { BracketMapCounts } from "../toMapList";
import { Bracket, type Standing } from "./Bracket";

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

		const result: Standing[] = [];
		for (const roundId of R.unique(teams.map((team) => team.lostAt))) {
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
