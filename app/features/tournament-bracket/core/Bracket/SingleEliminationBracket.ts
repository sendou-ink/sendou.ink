import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type {
	BracketData,
	MatchData,
	RoundData,
} from "~/features/tournament-bracket/core/engine/types";
import { invariant } from "~/utils/invariant";
import { type BracketMapCounts, roundSetKey } from "../toMapList";
import { Bracket, type MatchExit, type Standing } from "./Bracket";
import { cumulativeEliminationsByRound, participantIdsOf } from "./utils";

export class SingleEliminationBracket extends Bracket {
	get type(): Tables["TournamentStage"]["type"] {
		return "single_elimination";
	}

	defaultRoundBestOfs(data: BracketData) {
		const result: BracketMapCounts = new Map();

		const maxRoundNumber = Math.max(...data.round.map((round) => round.number));
		const defaultOfRound = (round: RoundData) => {
			// 3rd place match
			if (round.section === "finals") return 5;

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

	private thirdPlaceMatches() {
		const thirdPlaceRoundIds = new Set(
			this.data.round
				.filter((round) => round.section === "finals")
				.map((round) => round.id),
		);

		return this.data.match.filter((match) =>
			thirdPlaceRoundIds.has(match.roundId),
		);
	}

	private thirdPlaceMatchUndecided() {
		return this.thirdPlaceMatches().some(
			(match) => !winnerOfThirdPlaceMatch(match),
		);
	}

	protected calculateStandings(): Standing[] {
		const standingsByGroup = this.data.group.map((group) =>
			this.groupStandings(group.id),
		);

		return this.standingsWithoutNonParticipants(
			this.mergedGroupStandings(standingsByGroup),
		);
	}

	/** Teams knocked out by the round they lost in. Teams still in once every bracket match is over (one, unless the finals are skipped) share the top. */
	private groupStandings(groupId: number): Standing[] {
		const groupRounds = this.data.round.filter(
			(round) => round.groupId === groupId,
		);
		const groupMatches = this.data.match.filter(
			(match) => match.groupId === groupId,
		);
		const thirdPlaceRound = groupRounds.find(
			(round) => round.section === "finals",
		);
		const matches = groupMatches.filter(
			(match) => match.roundId !== thirdPlaceRound?.id,
		);
		const participantIds = participantIdsOf(groupMatches);

		const teams: { id: number; lostAt: number }[] = [];

		for (const match of matches.toSorted((a, b) => a.roundId - b.roundId)) {
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

		const stillInIds = participantIds.filter((participantId) =>
			teams.every((team) => team.id !== participantId),
		);
		const everyBracketMatchOver = matches.every(
			(match) => !match.opponent1 || !match.opponent2 || match.winnerSide,
		);

		const eliminationsThroughRound = cumulativeEliminationsByRound(matches);

		const result: Standing[] = [];
		for (const roundId of R.unique(teams.map((team) => team.lostAt))) {
			const teamsLostThisRound: { id: number }[] = [];
			while (teams.length && teams[0].lostAt === roundId) {
				teamsLostThisRound.push(teams.shift()!);
			}

			const placement =
				participantIds.length - eliminationsThroughRound.get(roundId)! + 1;

			for (const { id: teamId } of teamsLostThisRound) {
				const team = this.tournament.teamById(teamId);
				invariant(team, `Team not found for id: ${teamId}`);

				result.push({
					team,
					placement,
				});
			}
		}

		if (
			stillInIds.length === 1 ||
			(stillInIds.length > 0 && everyBracketMatchOver)
		) {
			for (const stillInId of stillInIds) {
				const stillInTeam = this.tournament.teamById(stillInId);
				invariant(stillInTeam, `Team not found for id: ${stillInId}`);

				result.push({
					team: stillInTeam,
					placement: 1,
				});
			}
		}

		const thirdPlaceMatchWinner = winnerOfThirdPlaceMatch(
			groupMatches.find((match) => match.roundId === thirdPlaceRound?.id),
		);

		return result
			.map((standing) => {
				// semifinal losers stay tied until the third place match decides between them
				if (standing.placement !== 3 || !thirdPlaceMatchWinner) return standing;

				return thirdPlaceMatchWinner.id === standing.team.id
					? standing
					: { ...standing, placement: 4 };
			})
			.sort((a, b) => a.placement - b.placement);
	}

	protected matchExits() {
		const result = new Map<number, MatchExit>();

		for (const group of this.data.group) {
			const groupRounds = this.data.round.filter(
				(round) => round.groupId === group.id,
			);
			const winnersRounds = groupRounds
				.filter((round) => round.section === "winners")
				.sort((a, b) => a.number - b.number);
			const thirdPlaceRound = groupRounds.find(
				(round) => round.section === "finals",
			);
			const firstRoundMatchCount = this.data.match.filter(
				(match) => match.roundId === winnersRounds[0]?.id,
			).length;
			const semifinalsNumber = Math.log2(firstRoundMatchCount * 2) - 1;
			const lastRound = winnersRounds.at(-1);

			// tiers from the top: teams still in, then the losers of each round, latest first
			let tier = 1;
			const loserTierByRoundId = new Map<number, number>();
			const thirdPlaceTiers = { winner: 0, loser: 0 };
			for (const round of winnersRounds.toReversed()) {
				if (!this.hasNonByeMatch(round.id)) continue;

				if (thirdPlaceRound && round.number === semifinalsNumber) {
					thirdPlaceTiers.winner = ++tier;
					thirdPlaceTiers.loser = ++tier;
					continue;
				}

				loserTierByRoundId.set(round.id, ++tier);
			}

			for (const [roundIdx, round] of winnersRounds.entries()) {
				for (const match of this.matchesOfRound(round.id)) {
					result.set(match.id, {
						winnerTier: round === lastRound ? 1 : undefined,
						loserTier: loserTierByRoundId.get(round.id),
						loserRound: loserTierByRoundId.has(round.id)
							? roundIdx + 1
							: undefined,
					});
				}
			}

			for (const match of thirdPlaceRound
				? this.matchesOfRound(thirdPlaceRound.id)
				: []) {
				result.set(match.id, {
					winnerTier: thirdPlaceTiers.winner,
					loserTier: thirdPlaceTiers.loser,
				});
			}
		}

		return result;
	}

	source({ placements, rest }: { placements: number[]; rest?: boolean }) {
		invariant(placements.length > 0, "Empty placements not supported");
		invariant(
			placements.every((placement) => placement < 0) ||
				placements.every((placement) => placement > 0),
			"Mixed positive and negative placements not supported",
		);

		if (placements.every((placement) => placement > 0)) {
			const source = this.sourceByStandings(placements, rest === true);

			// 3rd and 4th are only decided once the third place match is played
			return this.thirdPlaceMatchUndecided()
				? { ...source, relevantMatchesFinished: false }
				: source;
		}

		return this.sourceByElimination({
			section: "winners",
			roundCount: Math.abs(Math.min(...placements)),
		});
	}
}

/** The other semifinal was won against a BYE and produced no loser, so the lone semifinal loser takes third without playing. */
function winnerOfThirdPlaceMatch(match: MatchData | undefined) {
	if (!match) return undefined;

	if (match.opponent1 && !match.opponent2) return match.opponent1;
	if (!match.opponent1 && match.opponent2) return match.opponent2;

	if (match.winnerSide === "opponent1") return match.opponent1;
	if (match.winnerSide === "opponent2") return match.opponent2;

	return undefined;
}
