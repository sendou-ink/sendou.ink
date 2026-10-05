import * as R from "remeda";
import type { Tables } from "~/db/tables";
import type {
	BracketData,
	RoundData,
} from "~/features/tournament-bracket/core/engine/types";
import { invariant } from "~/utils/invariant";
import { type BracketMapCounts, roundSetKey } from "../toMapList";
import { Bracket, type MatchExit, type Standing } from "./Bracket";
import { cumulativeEliminationsByRound, participantIdsOf } from "./utils";

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

	protected calculateStandings(): Standing[] {
		if (!this.enoughTeams) return [];

		const standingsByGroup = this.data.group.map((group) =>
			this.groupStandings(group.id),
		);

		return this.standingsWithoutNonParticipants(
			this.mergedGroupStandings(standingsByGroup),
		);
	}

	/**
	 * Teams knocked out by the losers bracket round they lost in, the grand finals deciding 1st and 2nd.
	 * Without grand finals the teams still in once every match is over are ranked by losses: unbeaten teams share the top, one loss teams come next.
	 */
	private groupStandings(groupId: number): Standing[] {
		const groupRounds = this.data.round.filter(
			(round) => round.groupId === groupId,
		);
		const groupMatches = this.data.match.filter(
			(match) => match.groupId === groupId,
		);
		const matchesOfSection = (section: RoundData["section"]) => {
			const roundIds = new Set(
				groupRounds
					.filter((round) => round.section === section)
					.map((round) => round.id),
			);

			return groupMatches.filter((match) => roundIds.has(match.roundId));
		};
		const participantIds = participantIdsOf(groupMatches);

		const losersMatches = matchesOfSection("losers").sort(
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

		const eliminatedIds = new Set(teams.map((team) => team.id));

		const eliminationsThroughLosersRound =
			cumulativeEliminationsByRound(losersMatches);

		const result: Standing[] = [];
		for (const roundId of R.unique(teams.map((team) => team.lostAt))) {
			const teamsLostThisRound: { id: number }[] = [];
			while (teams.length && teams[0].lostAt === roundId) {
				teamsLostThisRound.push(teams.shift()!);
			}

			const placement =
				participantIds.length -
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

		const grandFinalMatches = matchesOfSection("finals").sort(
			(a, b) => a.roundId - b.roundId,
		);

		if (grandFinalMatches.length === 0) {
			const everyMatchOver = groupMatches.every(
				(match) => !match.opponent1 || !match.opponent2 || match.winnerSide,
			);
			if (!everyMatchOver) {
				return result.reverse();
			}

			const lossCount = (teamId: number) =>
				groupMatches.filter(
					(match) =>
						match.winnerSide &&
						match[match.winnerSide === "opponent1" ? "opponent2" : "opponent1"]
							?.id === teamId,
				).length;

			const stillIn = participantIds
				.filter((teamId) => !eliminatedIds.has(teamId))
				.map((teamId) => ({ teamId, losses: lossCount(teamId) }));
			const unbeatenCount = stillIn.filter((team) => team.losses === 0).length;

			for (const { teamId, losses } of stillIn.toSorted(
				(a, b) => b.losses - a.losses,
			)) {
				const team = this.tournament.teamById(teamId);
				invariant(team, `Team not found for id: ${teamId}`);

				result.push({
					team,
					placement: losses === 0 ? 1 : unbeatenCount + 1,
				});
			}

			return result.reverse();
		}

		const [grandFinal, bracketReset] = grandFinalMatches;
		const decidingMatch =
			grandFinal.opponent1 &&
			grandFinal.winnerSide &&
			// if opponent1 won in DE it means that bracket reset is not played
			(grandFinal.winnerSide === "opponent1" || !bracketReset)
				? grandFinal
				: bracketReset?.winnerSide
					? bracketReset
					: null;

		if (decidingMatch) {
			const loser =
				decidingMatch.winnerSide === "opponent1" ? "opponent2" : "opponent1";
			const winner = loser === "opponent1" ? "opponent2" : "opponent1";

			const loserTeam = this.tournament.teamById(decidingMatch[loser]!.id!);
			invariant(loserTeam, "Loser team not found");
			const winnerTeam = this.tournament.teamById(decidingMatch[winner]!.id!);
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

		return result.reverse();
	}

	protected matchExits() {
		const result = new Map<number, MatchExit>();

		for (const group of this.data.group) {
			const groupRounds = this.data.round.filter(
				(round) => round.groupId === group.id,
			);
			const roundsOfSection = (section: RoundData["section"]) =>
				groupRounds
					.filter((round) => round.section === section)
					.sort((a, b) => a.number - b.number);
			const winnersRounds = roundsOfSection("winners");
			const losersRounds = roundsOfSection("losers");
			const [grandFinal, bracketReset] = roundsOfSection("finals");

			const upperBracketRoundCount = Math.log2(
				this.matchesOfRound(winnersRounds[0]?.id ?? -1).length * 2,
			);
			const losersRoundCount = Math.max(0, (upperBracketRoundCount - 1) * 2);
			const losersRoundNumbers = new Set(
				losersRounds.map((round) => round.number),
			);

			// tiers from the top: grand finals winner & loser (or unbeaten & alive with one loss), then the losers of each losers round, latest first
			const ONE_LOSS_TIER = 2;
			let tier = 2;
			const loserTierByRoundId = new Map<number, number>();
			for (const round of losersRounds.toReversed()) {
				if (!this.hasNonByeMatch(round.id)) continue;

				loserTierByRoundId.set(round.id, ++tier);
			}

			for (const round of winnersRounds) {
				const isLastPlayed = round === winnersRounds.at(-1);
				const losersRoundNumber = round.number > 1 ? (round.number - 1) * 2 : 1;
				const loserStaysAlive =
					losersRoundCount === 0 || !losersRoundNumbers.has(losersRoundNumber);

				for (const match of this.matchesOfRound(round.id)) {
					result.set(match.id, {
						winnerTier: isLastPlayed && !grandFinal ? 1 : undefined,
						loserTier: loserStaysAlive ? ONE_LOSS_TIER : undefined,
					});
				}
			}

			const firstRoundIsOnlyByes =
				losersRounds.length > 0 && !this.hasNonByeMatch(losersRounds[0].id);
			for (const [roundIdx, round] of losersRounds.entries()) {
				const continuesInBracket =
					round.number < losersRoundCount
						? losersRoundNumbers.has(round.number + 1)
						: Boolean(grandFinal);

				for (const match of this.matchesOfRound(round.id)) {
					result.set(match.id, {
						winnerTier: continuesInBracket ? undefined : ONE_LOSS_TIER,
						loserTier: loserTierByRoundId.get(round.id),
						loserRound: firstRoundIsOnlyByes ? roundIdx : roundIdx + 1,
					});
				}
			}

			const grandFinalMatch = grandFinal
				? this.matchesOfRound(grandFinal.id)[0]
				: undefined;
			const decidingRounds = [
				...(grandFinal &&
				(!bracketReset || grandFinalMatch?.winnerSide === "opponent1")
					? [grandFinal]
					: []),
				...(bracketReset ? [bracketReset] : []),
			];
			for (const round of decidingRounds) {
				for (const match of this.matchesOfRound(round.id)) {
					result.set(match.id, { winnerTier: 1, loserTier: 2 });
				}
			}
		}

		return result;
	}

	get everyMatchOver() {
		if (this.preview) return false;

		// bracket reset is not played if the winners bracket team wins the grand finals
		const unneededBracketResets = new Set(
			[...this.bracketResetMatchIds()].filter((bracketResetId) => {
				const bracketReset = this.data.match.find(
					(match) => match.id === bracketResetId,
				);
				const grandFinal = this.data.match.find(
					(match) =>
						match.groupId === bracketReset?.groupId &&
						this.data.round.some(
							(round) =>
								round.id === match.roundId &&
								round.section === "finals" &&
								round.number === 1,
						),
				);

				return grandFinal?.winnerSide === "opponent1";
			}),
		);

		for (const match of this.data.match) {
			if (unneededBracketResets.has(match.id)) continue;
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

		return this.sourceByElimination({
			section: "losers",
			roundCount: Math.abs(Math.min(...placements)),
		});
	}
}
