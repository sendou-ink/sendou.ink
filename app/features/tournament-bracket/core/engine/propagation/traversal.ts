import type { SetNextOpponent } from "../helpers";
import * as helpers from "../helpers";
import { matchStatus } from "../status";
import type {
	GroupData,
	GroupType,
	MatchData,
	MatchResultsInput,
	Side,
	StageData,
	StageType,
} from "../types";
import type { Store } from "./store";

interface RoundPositionalInfo {
	roundNumber: number;
	roundCount: number;
}

/**
 * Resolves the matches following another match and applies result propagation
 * to them. Port of the old base/getter.ts + base/updater.ts, reading and
 * writing a Store instead of storage.
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
	 * Propagates the results of a match to the matches following it.
	 *
	 * @param match A match.
	 */
	updateRelatedMatches(match: MatchData): void {
		const { roundNumber, roundCount } = this.getRoundPositionalInfo(
			match.round_id,
		);

		const stage = this.store.select("stage", match.stage_id);
		if (!stage) throw Error("Stage not found.");

		const group = this.store.select("group", match.group_id);
		if (!group) throw Error("Group not found.");

		const matchLocation = helpers.getMatchLocation(stage.type, group.number);

		this.updateNext(match, matchLocation, stage, roundNumber, roundCount);
	}

	/**
	 * Updates a match based on a reported result.
	 *
	 * @param stored A reference to what will be updated in the storage.
	 * @param input Input of the update.
	 * @param force Whether to force update matches that can't be played yet.
	 */
	updateMatch(
		stored: MatchData,
		input: MatchResultsInput,
		force?: boolean,
	): void {
		if (!force && matchStatus(this.store.data, stored.id) === "PENDING")
			throw Error("The match is locked.");

		const stage = this.store.select("stage", stored.stage_id);
		if (!stage) throw Error("Stage not found.");

		const resultChanged = helpers.setMatchResults(stored, input);
		this.applyMatchUpdate(stored);

		// Don't propagate if it's a simple score update.
		if (!resultChanged) return;

		if (
			stage.type === "single_elimination" ||
			stage.type === "double_elimination"
		) {
			this.updateRelatedMatches(stored);
		}
	}

	/**
	 * Updates the opponents of a match.
	 *
	 * @param match A match.
	 */
	applyMatchUpdate(match: MatchData): void {
		this.store.updateMatch(match);
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

		if (winnerSide)
			this.applyToNextMatches(
				helpers.setNextOpponent,
				match,
				matchLocation,
				roundNumber,
				roundCount,
				nextMatches,
				winnerSide,
			);
		else
			this.applyToNextMatches(
				helpers.resetNextOpponent,
				match,
				matchLocation,
				roundNumber,
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
		helpers.resolveByeWinner(match); // BYE propagation is only in non round-robin stages.
		this.applyMatchUpdate(match);

		if (helpers.hasBye(match)) this.updateRelatedMatches(match);
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

		const roundNumberLB = roundNumber > 1 ? (roundNumber - 1) * 2 : 1;

		const participantCount = this.participantCount(match.stage_id);
		const method = helpers.getLoserOrdering(participantCount, roundNumberLB);
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
			match.winnerSide === "opponent1"
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
	 * Gets the participant count of an elimination stage, derived from its upper
	 * bracket's first round (two participants per match, BYEs included).
	 *
	 * @param stageId ID of the stage.
	 */
	private participantCount(stageId: number): number {
		const upperBracket = this.getUpperBracket(stageId);
		const firstRound = this.store.selectFirst("round", {
			group_id: upperBracket.id,
			number: 1,
		});
		if (!firstRound) throw Error("First round not found.");

		const firstRoundMatches = this.store.selectAll("match", {
			round_id: firstRound.id,
		});
		return firstRoundMatches.length * 2;
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
