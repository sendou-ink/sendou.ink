import type { SetNextOpponent } from "../helpers";
import * as helpers from "../helpers";
import type {
	DeepPartial,
	GroupData,
	GroupType,
	MatchData,
	RoundData,
	Side,
	StageData,
	StageType,
} from "../types";
import { MatchStatus } from "../types";
import type { Store } from "./store";

interface RoundPositionalInfo {
	roundNumber: number;
	roundCount: number;
}

/**
 * Resolves matches related to another match (previous and next) and applies
 * result propagation to them. 1:1 port of the old base/getter.ts +
 * base/updater.ts, reading and writing a Store instead of storage.
 */
export class Propagator {
	readonly store: Store;

	constructor(store: Store) {
		this.store = store;
	}

	/* ------------------------------------------------------------------ */
	/* Updater (base/updater.ts)                                           */
	/* ------------------------------------------------------------------ */

	/**
	 * Updates the matches related (previous and next) to a match.
	 *
	 * @param match A match.
	 * @param updatePrevious Whether to update the previous matches.
	 * @param updateNext Whether to update the next matches.
	 */
	updateRelatedMatches(
		match: MatchData,
		updatePrevious: boolean,
		updateNext: boolean,
	): void {
		const { roundNumber, roundCount } = this.getRoundPositionalInfo(
			match.round_id,
		);

		const stage = this.store.select("stage", match.stage_id);
		if (!stage) throw Error("Stage not found.");

		const group = this.store.select("group", match.group_id);
		if (!group) throw Error("Group not found.");

		const matchLocation = helpers.getMatchLocation(stage.type, group.number);

		updatePrevious &&
			this.updatePrevious(match, matchLocation, stage, roundNumber);
		updateNext &&
			this.updateNext(match, matchLocation, stage, roundNumber, roundCount);
	}

	/**
	 * Updates a match based on a partial match.
	 *
	 * @param stored A reference to what will be updated in the storage.
	 * @param match Input of the update.
	 * @param force Whether to force update locked matches.
	 */
	updateMatch(
		stored: MatchData,
		match: DeepPartial<MatchData>,
		force?: boolean,
	): void {
		if (!force && helpers.isMatchUpdateLocked(stored))
			throw Error("The match is locked.");

		const stage = this.store.select("stage", stored.stage_id);
		if (!stage) throw Error("Stage not found.");

		const { statusChanged, resultChanged } = helpers.setMatchResults(
			stored,
			match,
		);
		this.applyMatchUpdate(stored);

		// Don't update related matches if it's a simple score update.
		if (!statusChanged && !resultChanged) return;

		if (!helpers.isRoundRobin(stage) && !helpers.isSwiss(stage)) {
			this.updateRelatedMatches(stored, statusChanged, resultChanged);
		} else if (helpers.isRoundRobin(stage) && resultChanged) {
			this.unlockNextRoundRobinRound(stored);
		}
	}

	/**
	 * Updates the opponents and status of a match.
	 *
	 * @param match A match.
	 */
	applyMatchUpdate(match: MatchData): void {
		this.store.updateMatch(match);
	}

	/**
	 * Updates the match(es) leading to the current match based on this match results.
	 *
	 * @param match Input of the update.
	 * @param matchLocation Location of the current match.
	 * @param stage The parent stage.
	 * @param roundNumber Number of the round.
	 */
	private updatePrevious(
		match: MatchData,
		matchLocation: GroupType,
		stage: StageData,
		roundNumber: number,
	): void {
		const previousMatches = this.getPreviousMatches(
			match,
			matchLocation,
			stage,
			roundNumber,
		);
		if (previousMatches.length === 0) return;

		if (match.status < MatchStatus.Running) {
			this.resetMatchesStatus(previousMatches);
		}
	}

	/**
	 * Resets the status of a list of matches to what it should currently be.
	 *
	 * @param matches The matches to update.
	 */
	private resetMatchesStatus(matches: MatchData[]): void {
		for (const match of matches) {
			match.status = helpers.getMatchStatus(match);
			this.applyMatchUpdate(match);
		}
	}

	/**
	 * Updates the match(es) following the current match based on this match results.
	 *
	 * @param match Input of the update.
	 * @param matchLocation Location of the current match.
	 * @param stage The parent stage.
	 * @param roundNumber Number of the round.
	 * @param roundCount Count of rounds.
	 */
	private updateNext(
		match: MatchData,
		matchLocation: GroupType,
		stage: StageData,
		roundNumber: number,
		roundCount: number,
	): void {
		const nextMatches = this.getNextMatches(
			match,
			matchLocation,
			stage,
			roundNumber,
			roundCount,
		);
		if (nextMatches.length === 0) {
			return;
		}

		const winnerSide = helpers.getMatchResult(match);
		const actualRoundNumber =
			stage.settings.skipFirstRound && matchLocation === "winner_bracket"
				? roundNumber + 1
				: roundNumber;

		if (winnerSide)
			this.applyToNextMatches(
				helpers.setNextOpponent,
				match,
				matchLocation,
				actualRoundNumber,
				roundCount,
				nextMatches,
				winnerSide,
			);
		else
			this.applyToNextMatches(
				helpers.resetNextOpponent,
				match,
				matchLocation,
				actualRoundNumber,
				roundCount,
				nextMatches,
			);
	}

	/**
	 * Applies a SetNextOpponent function to matches following the current match.
	 *
	 * @param setNextOpponent The SetNextOpponent function.
	 * @param match The current match.
	 * @param matchLocation Location of the current match.
	 * @param roundNumber Number of the current round.
	 * @param roundCount Count of rounds.
	 * @param nextMatches The matches following the current match.
	 * @param winnerSide Side of the winner in the current match.
	 */
	private applyToNextMatches(
		setNextOpponent: SetNextOpponent,
		match: MatchData,
		matchLocation: GroupType,
		roundNumber: number,
		roundCount: number,
		nextMatches: (MatchData | null)[],
		winnerSide?: Side,
	): void {
		if (matchLocation === "final_group") {
			if (!nextMatches[0]) throw Error("First next match is null.");
			setNextOpponent(nextMatches[0], "opponent1", match, "opponent1");
			setNextOpponent(nextMatches[0], "opponent2", match, "opponent2");
			this.applyMatchUpdate(nextMatches[0]);
			return;
		}

		const nextSide = helpers.getNextSide(
			match.number,
			roundNumber,
			roundCount,
			matchLocation,
		);

		if (nextMatches[0]) {
			setNextOpponent(nextMatches[0], nextSide, match, winnerSide);
			this.propagateByeWinners(nextMatches[0]);
		}

		if (nextMatches.length !== 2) return;
		if (!nextMatches[1]) throw Error("Second next match is null.");

		// The second match is either the consolation final (single elimination) or a loser bracket match (double elimination).

		if (matchLocation === "single_bracket") {
			setNextOpponent(
				nextMatches[1],
				nextSide,
				match,
				winnerSide && helpers.getOtherSide(winnerSide),
			);
			this.applyMatchUpdate(nextMatches[1]);
		} else {
			const nextSideLB = helpers.getNextSideLoserBracket(
				match.number,
				nextMatches[1],
				roundNumber,
			);
			setNextOpponent(
				nextMatches[1],
				nextSideLB,
				match,
				winnerSide && helpers.getOtherSide(winnerSide),
			);
			this.propagateByeWinners(nextMatches[1]);
		}
	}

	/**
	 * Propagates winner against BYEs in related matches.
	 *
	 * @param match The current match.
	 */
	propagateByeWinners(match: MatchData): void {
		helpers.setMatchResults(match, match); // BYE propagation is only in non round-robin stages.
		this.applyMatchUpdate(match);

		if (helpers.hasBye(match)) this.updateRelatedMatches(match, true, true);
	}

	/**
	 * Unlocks matches in the next round of a round-robin group if both participants are ready.
	 *
	 * @param match The match that was just completed.
	 */
	private unlockNextRoundRobinRound(match: MatchData): void {
		const round = this.store.select("round", match.round_id);
		if (!round) throw Error("Round not found.");

		const nextRound = this.store.selectFirst("round", {
			group_id: round.group_id,
			number: round.number + 1,
		});
		if (!nextRound) return;

		const currentRoundMatches = this.store.selectAll("match", {
			round_id: round.id,
		});

		const nextRoundMatches = this.store.selectAll("match", {
			round_id: nextRound.id,
		});

		for (const nextMatch of nextRoundMatches) {
			if (nextMatch.status !== MatchStatus.Locked) continue;

			const participant1Id = nextMatch.opponent1?.id;
			const participant2Id = nextMatch.opponent2?.id;

			if (!participant1Id || !participant2Id) continue;

			const participant1Ready = this.isParticipantReadyForNextRound(
				participant1Id,
				currentRoundMatches,
			);
			const participant2Ready = this.isParticipantReadyForNextRound(
				participant2Id,
				currentRoundMatches,
			);

			if (participant1Ready && participant2Ready) {
				nextMatch.status = MatchStatus.Ready;
				this.applyMatchUpdate(nextMatch);
			}
		}
	}

	/**
	 * Checks if a participant has completed their match in the current round.
	 *
	 * @param participantId The participant to check.
	 * @param roundMatches All matches in the round.
	 */
	private isParticipantReadyForNextRound(
		participantId: number,
		roundMatches: MatchData[],
	): boolean {
		const participantMatch = roundMatches.find(
			(m) =>
				m.opponent1?.id === participantId || m.opponent2?.id === participantId,
		);

		// If the participant doesn't have a match in this round, they had a bye/didn't play
		// and are considered ready
		if (!participantMatch) return true;

		// If the match has a BYE (one opponent is null), it's considered completed
		if (!participantMatch.opponent1?.id || !participantMatch.opponent2?.id)
			return true;

		return participantMatch.status >= MatchStatus.Completed;
	}

	/* ------------------------------------------------------------------ */
	/* Getter (base/getter.ts)                                             */
	/* ------------------------------------------------------------------ */

	/**
	 * Gets the positional information (number in group and total number of rounds in group) of a round based on its id.
	 *
	 * @param roundId ID of the round.
	 */
	getRoundPositionalInfo(roundId: number): RoundPositionalInfo {
		const round = this.store.select("round", roundId);
		if (!round) throw Error("Round not found.");

		const rounds = this.store.selectAll("round", {
			group_id: round.group_id,
		});

		return {
			roundNumber: round.number,
			roundCount: rounds.length,
		};
	}

	/**
	 * Gets the matches leading to the given match.
	 *
	 * @param match The current match.
	 * @param matchLocation Location of the current match.
	 * @param stage The parent stage.
	 * @param roundNumber Number of the round.
	 */
	getPreviousMatches(
		match: MatchData,
		matchLocation: GroupType,
		stage: StageData,
		roundNumber: number,
	): MatchData[] {
		if (matchLocation === "loser_bracket")
			return this.getPreviousMatchesLB(match, stage, roundNumber);

		if (matchLocation === "final_group")
			return this.getPreviousMatchesFinal(match, stage, roundNumber);

		if (roundNumber === 1) return []; // The match is in the first round of an upper bracket.

		return this.getMatchesBeforeMajorRound(match, roundNumber);
	}

	/**
	 * Gets the matches leading to the given match, which is in a final group (consolation final or grand final).
	 *
	 * @param match The current match.
	 * @param stage The parent stage.
	 * @param roundNumber Number of the current round.
	 */
	private getPreviousMatchesFinal(
		match: MatchData,
		stage: StageData,
		roundNumber: number,
	): MatchData[] {
		if (stage.type === "single_elimination")
			return this.getPreviousMatchesFinalSingleElimination(match, stage);

		return this.getPreviousMatchesFinalDoubleElimination(match, roundNumber);
	}

	/**
	 * Gets the matches leading to the given match, which is in a final group (consolation final).
	 *
	 * @param match The current match.
	 * @param stage The parent stage.
	 */
	private getPreviousMatchesFinalSingleElimination(
		match: MatchData,
		stage: StageData,
	): MatchData[] {
		const upperBracket = this.getUpperBracket(match.stage_id);
		const upperBracketRoundCount = helpers.getUpperBracketRoundCount(
			stage.settings.size!,
		);

		const semiFinalsRound = this.store.selectFirst("round", {
			group_id: upperBracket.id,
			number: upperBracketRoundCount - 1, // Second to last round
		});

		if (!semiFinalsRound) throw Error("Semi finals round not found.");

		const semiFinalMatches = this.store.selectAll("match", {
			round_id: semiFinalsRound.id,
		});

		// In single elimination, both the final and consolation final have the same previous matches.
		return semiFinalMatches;
	}

	/**
	 * Gets the matches leading to the given match, which is in a final group (grand final).
	 *
	 * @param match The current match.
	 * @param roundNumber Number of the current round.
	 */
	private getPreviousMatchesFinalDoubleElimination(
		match: MatchData,
		roundNumber: number,
	): MatchData[] {
		if (roundNumber > 1)
			// Double grand final
			return [this.findMatch(match.group_id, roundNumber - 1, 1)];

		const winnerBracket = this.getUpperBracket(match.stage_id);
		const lastRoundWB = this.getLastRound(winnerBracket.id);

		const winnerBracketFinalMatch = this.store.selectFirst("match", {
			round_id: lastRoundWB.id,
			number: 1,
		});

		if (!winnerBracketFinalMatch) throw Error("Match not found.");

		const loserBracket = this.getLoserBracket(match.stage_id);
		if (!loserBracket) throw Error("Loser bracket not found.");

		const lastRoundLB = this.getLastRound(loserBracket.id);
		const loserBracketFinalMatch = this.store.selectFirst("match", {
			round_id: lastRoundLB.id,
			number: 1,
		});

		if (!loserBracketFinalMatch) throw Error("Match not found.");

		return [winnerBracketFinalMatch, loserBracketFinalMatch];
	}

	/**
	 * Gets the matches leading to a given match from the loser bracket.
	 *
	 * @param match The current match.
	 * @param stage The parent stage.
	 * @param roundNumber Number of the round.
	 */
	private getPreviousMatchesLB(
		match: MatchData,
		stage: StageData,
		roundNumber: number,
	): MatchData[] {
		if (stage.settings.skipFirstRound && roundNumber === 1) return [];

		if (helpers.hasBye(match)) return []; // Shortcut because we are coming from propagateByes().

		const winnerBracket = this.getUpperBracket(match.stage_id);
		const actualRoundNumberWB = Math.ceil((roundNumber + 1) / 2);

		const roundNumberWB = stage.settings.skipFirstRound
			? actualRoundNumberWB - 1
			: actualRoundNumberWB;

		if (roundNumber === 1)
			return this.getMatchesBeforeFirstRoundLB(
				match,
				winnerBracket.id,
				roundNumberWB,
			);

		if (roundNumber % 2 === 0)
			return this.getMatchesBeforeMinorRoundLB(
				match,
				winnerBracket.id,
				roundNumber,
				roundNumberWB,
			);

		return this.getMatchesBeforeMajorRound(match, roundNumber);
	}

	/**
	 * Gets the matches leading to a given match in a major round (every round of upper bracket or specific ones in lower bracket).
	 *
	 * @param match The current match.
	 * @param roundNumber Number of the round.
	 */
	private getMatchesBeforeMajorRound(
		match: MatchData,
		roundNumber: number,
	): MatchData[] {
		return [
			this.findMatch(match.group_id, roundNumber - 1, match.number * 2 - 1),
			this.findMatch(match.group_id, roundNumber - 1, match.number * 2),
		];
	}

	/**
	 * Gets the matches leading to a given match in the first round of the loser bracket.
	 *
	 * @param match The current match.
	 * @param winnerBracketId ID of the winner bracket.
	 * @param roundNumberWB The number of the previous round in the winner bracket.
	 */
	private getMatchesBeforeFirstRoundLB(
		match: MatchData,
		winnerBracketId: number,
		roundNumberWB: number,
	): MatchData[] {
		return [
			this.findMatch(
				winnerBracketId,
				roundNumberWB,
				helpers.getOriginPosition(match, "opponent1"),
			),
			this.findMatch(
				winnerBracketId,
				roundNumberWB,
				helpers.getOriginPosition(match, "opponent2"),
			),
		];
	}

	/**
	 * Gets the matches leading to a given match in a minor round of the loser bracket.
	 *
	 * @param match The current match.
	 * @param winnerBracketId ID of the winner bracket.
	 * @param roundNumber Number of the current round.
	 * @param roundNumberWB The number of the previous round in the winner bracket.
	 */
	private getMatchesBeforeMinorRoundLB(
		match: MatchData,
		winnerBracketId: number,
		roundNumber: number,
		roundNumberWB: number,
	): MatchData[] {
		const matchNumber = helpers.getOriginPosition(match, "opponent1");

		return [
			this.findMatch(winnerBracketId, roundNumberWB, matchNumber),
			this.findMatch(match.group_id, roundNumber - 1, match.number),
		];
	}

	/**
	 * Gets the match(es) where the opponents of the current match will go just after.
	 *
	 * @param match The current match.
	 * @param matchLocation Location of the current match.
	 * @param stage The parent stage.
	 * @param roundNumber The number of the current round.
	 * @param roundCount Count of rounds.
	 */
	getNextMatches(
		match: MatchData,
		matchLocation: GroupType,
		stage: StageData,
		roundNumber: number,
		roundCount: number,
	): (MatchData | null)[] {
		switch (matchLocation) {
			case "single_bracket":
				return this.getNextMatchesUpperBracket(
					match,
					stage.type,
					roundNumber,
					roundCount,
				);
			case "winner_bracket":
				return this.getNextMatchesWB(match, stage, roundNumber, roundCount);
			case "loser_bracket":
				return this.getNextMatchesLB(
					match,
					stage.type,
					roundNumber,
					roundCount,
				);
			case "final_group":
				return this.getNextMatchesFinal(match, roundNumber, roundCount);
			default:
				throw Error("Unknown bracket kind.");
		}
	}

	/**
	 * Gets the match(es) where the opponents of the current match of winner bracket will go just after.
	 *
	 * @param match The current match.
	 * @param stage The parent stage.
	 * @param roundNumber The number of the current round.
	 * @param roundCount Count of rounds.
	 */
	private getNextMatchesWB(
		match: MatchData,
		stage: StageData,
		roundNumber: number,
		roundCount: number,
	): (MatchData | null)[] {
		const loserBracket = this.getLoserBracket(match.stage_id);
		if (loserBracket === null)
			// Only one match in the stage, there is no loser bracket.
			return [];

		const actualRoundNumber = stage.settings.skipFirstRound
			? roundNumber + 1
			: roundNumber;
		const roundNumberLB =
			actualRoundNumber > 1 ? (actualRoundNumber - 1) * 2 : 1;

		const participantCount = stage.settings.size!;
		const method = helpers.getLoserOrdering(
			stage.settings.seedOrdering!,
			roundNumberLB,
		);
		const actualMatchNumberLB = helpers.findLoserMatchNumber(
			participantCount,
			roundNumberLB,
			match.number,
			method,
		);

		return [
			...this.getNextMatchesUpperBracket(
				match,
				stage.type,
				roundNumber,
				roundCount,
			),
			this.findMatch(loserBracket.id, roundNumberLB, actualMatchNumberLB),
		];
	}

	/**
	 * Gets the match(es) where the opponents of the current match of an upper bracket will go just after.
	 *
	 * @param match The current match.
	 * @param stageType Type of the stage.
	 * @param roundNumber The number of the current round.
	 * @param roundCount Count of rounds.
	 */
	private getNextMatchesUpperBracket(
		match: MatchData,
		stageType: StageType,
		roundNumber: number,
		roundCount: number,
	): (MatchData | null)[] {
		if (stageType === "single_elimination")
			return this.getNextMatchesUpperBracketSingleElimination(
				match,
				stageType,
				roundNumber,
				roundCount,
			);

		if (stageType === "double_elimination" && roundNumber === roundCount)
			return [this.getFirstMatchFinal(match, stageType)];

		return [this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
	}

	/**
	 * Gets the match(es) where the opponents of the current match of the unique bracket of a single elimination will go just after.
	 *
	 * @param match The current match.
	 * @param stageType Type of the stage.
	 * @param roundNumber The number of the current round.
	 * @param roundCount Count of rounds.
	 */
	private getNextMatchesUpperBracketSingleElimination(
		match: MatchData,
		stageType: StageType,
		roundNumber: number,
		roundCount: number,
	): MatchData[] {
		if (roundNumber === roundCount - 1) {
			const final = this.getFirstMatchFinal(match, stageType);
			return [
				this.getDiagonalMatch(match.group_id, roundNumber, match.number),
				...(final ? [final] : []),
			];
		}

		if (roundNumber === roundCount) return [];

		return [this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
	}

	/**
	 * Gets the match(es) where the opponents of the current match of loser bracket will go just after.
	 *
	 * @param match The current match.
	 * @param stageType Type of the stage.
	 * @param roundNumber The number of the current round.
	 * @param roundCount Count of rounds.
	 */
	private getNextMatchesLB(
		match: MatchData,
		stageType: StageType,
		roundNumber: number,
		roundCount: number,
	): MatchData[] {
		if (roundNumber === roundCount) {
			const final = this.getFirstMatchFinal(match, stageType);
			return final ? [final] : [];
		}

		if (roundNumber % 2 === 1)
			return this.getMatchAfterMajorRoundLB(match, roundNumber);

		return this.getMatchAfterMinorRoundLB(match, roundNumber);
	}

	/**
	 * Gets the first match of the final group (consolation final or grand final).
	 *
	 * @param match The current match.
	 * @param stageType Type of the stage.
	 */
	private getFirstMatchFinal(
		match: MatchData,
		stageType: StageType,
	): MatchData | null {
		const finalGroupId = this.getFinalGroupId(match.stage_id, stageType);
		if (finalGroupId === null) return null;

		return this.findMatch(finalGroupId, 1, 1);
	}

	/**
	 * Gets the matches following the current match, which is in the final group (consolation final or grand final).
	 *
	 * @param match The current match.
	 * @param roundNumber The number of the current round.
	 * @param roundCount The count of rounds.
	 */
	private getNextMatchesFinal(
		match: MatchData,
		roundNumber: number,
		roundCount: number,
	): MatchData[] {
		if (
			roundNumber === roundCount ||
			// avoid putting teams to bracket reset if tournament is over
			match.opponent1?.result === "win"
		) {
			return [];
		}

		return [this.findMatch(match.group_id, roundNumber + 1, 1)];
	}

	/**
	 * Gets the match(es) where the opponents of the current match of a winner bracket's major round will go just after.
	 *
	 * @param match The current match.
	 * @param roundNumber The number of the current round.
	 */
	private getMatchAfterMajorRoundLB(
		match: MatchData,
		roundNumber: number,
	): MatchData[] {
		return [this.getParallelMatch(match.group_id, roundNumber, match.number)];
	}

	/**
	 * Gets the match(es) where the opponents of the current match of a winner bracket's minor round will go just after.
	 *
	 * @param match The current match.
	 * @param roundNumber The number of the current round.
	 */
	private getMatchAfterMinorRoundLB(
		match: MatchData,
		roundNumber: number,
	): MatchData[] {
		return [this.getDiagonalMatch(match.group_id, roundNumber, match.number)];
	}

	/**
	 * Gets the last round of a group.
	 *
	 * @param groupId ID of the group.
	 */
	private getLastRound(groupId: number): RoundData {
		const round = this.store.selectLast("round", { group_id: groupId });
		if (!round) throw Error("Error getting rounds.");
		return round;
	}

	/**
	 * Returns the id of the final group (consolation final or grand final).
	 *
	 * @param stageId ID of the stage.
	 * @param stageType Type of the stage.
	 */
	private getFinalGroupId(
		stageId: number,
		stageType: StageType,
	): number | null {
		const groupNumber =
			stageType === "single_elimination"
				? 2 /* Consolation final */
				: 3; /* Grand final */
		const finalGroup = this.store.selectFirst("group", {
			stage_id: stageId,
			number: groupNumber,
		});
		if (!finalGroup) return null;
		return finalGroup.id;
	}

	/**
	 * Gets the upper bracket (the only bracket if single elimination or the winner bracket in double elimination).
	 *
	 * @param stageId ID of the stage.
	 */
	private getUpperBracket(stageId: number): GroupData {
		const winnerBracket = this.store.selectFirst("group", {
			stage_id: stageId,
			number: 1,
		});
		if (!winnerBracket) throw Error("Winner bracket not found.");
		return winnerBracket;
	}

	/**
	 * Gets the loser bracket.
	 *
	 * @param stageId ID of the stage.
	 */
	private getLoserBracket(stageId: number): GroupData | null {
		return this.store.selectFirst("group", { stage_id: stageId, number: 2 });
	}

	/**
	 * Gets the corresponding match in the next round ("diagonal match") the usual way.
	 *
	 * Just like from Round 1 to Round 2 in a single elimination stage.
	 *
	 * @param groupId ID of the group.
	 * @param roundNumber Number of the round in its parent group.
	 * @param matchNumber Number of the match in its parent round.
	 */
	private getDiagonalMatch(
		groupId: number,
		roundNumber: number,
		matchNumber: number,
	): MatchData {
		return this.findMatch(
			groupId,
			roundNumber + 1,
			helpers.getDiagonalMatchNumber(matchNumber),
		);
	}

	/**
	 * Gets the corresponding match in the next round ("parallel match") the "major round to minor round" way.
	 *
	 * Just like from Round 1 to Round 2 in the loser bracket of a double elimination stage.
	 *
	 * @param groupId ID of the group.
	 * @param roundNumber Number of the round in its parent group.
	 * @param matchNumber Number of the match in its parent round.
	 */
	private getParallelMatch(
		groupId: number,
		roundNumber: number,
		matchNumber: number,
	): MatchData {
		return this.findMatch(groupId, roundNumber + 1, matchNumber);
	}

	/**
	 * Finds a match in a given group. The match must have the given number in a round of which the number in group is given.
	 *
	 * @param groupId ID of the group.
	 * @param roundNumber Number of the round in its parent group.
	 * @param matchNumber Number of the match in its parent round.
	 */
	findMatch(
		groupId: number,
		roundNumber: number,
		matchNumber: number,
	): MatchData {
		const round = this.store.selectFirst("round", {
			group_id: groupId,
			number: roundNumber,
		});

		if (!round) throw Error("Round not found.");

		const match = this.store.selectFirst("match", {
			round_id: round.id,
			number: matchNumber,
		});

		if (!match) throw Error("Match not found.");

		return match;
	}
}
