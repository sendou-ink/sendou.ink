import { matchStatus, winnerSideByScore } from "../status";
import type {
	GroupData,
	GroupType,
	MatchData,
	MatchResultsInput,
	Side,
	StageData,
	StageType,
} from "../types";
import type { SetNextOpponent } from "./helpers";
import * as helpers from "./helpers";
import type { Store } from "./store";

interface RoundPositionalInfo {
	roundNumber: number;
	roundCount: number;
}

/** Resolves the matches following another match and propagates results to them, mutating Store rows. */
export class Propagator {
	readonly store: Store;

	constructor(store: Store) {
		this.store = store;
	}

	updateRelatedMatches(match: MatchData): void {
		const { roundNumber, roundCount } = this.getRoundPositionalInfo(
			match.roundId,
		);

		const stage = this.store.stageById(match.stageId);
		if (!stage) throw Error("Stage not found.");

		const group = this.store.groupById(match.groupId);
		if (!group) throw Error("Group not found.");

		const matchLocation = helpers.getMatchLocation(stage.type, group.number);

		this.updateNext(match, matchLocation, stage, roundNumber, roundCount);
	}

	/** @param force Also update matches that can't be played yet. */
	updateMatch(
		stored: MatchData,
		input: MatchResultsInput,
		force?: boolean,
	): void {
		if (!force && matchStatus(this.store.data, stored.id) === "PENDING")
			throw Error("The match is locked.");

		const stage = this.store.stageById(stored.stageId);
		if (!stage) throw Error("Stage not found.");

		const resultChanged = helpers.setMatchResults(
			stored,
			input.scores,
			input.winnerSide ?? this.winnerSideAfter(stored, input.scores),
		);
		this.store.markMatchChanged(stored);

		// Don't propagate if it's a simple score update.
		if (!resultChanged) return;

		if (
			stage.type === "single_elimination" ||
			stage.type === "double_elimination"
		) {
			this.updateRelatedMatches(stored);
		}
	}

	/** `undefined` when the set is not over or the round has no map count (bracket created without map lists). */
	private winnerSideAfter(
		stored: MatchData,
		scores: MatchResultsInput["scores"],
	): Side | undefined {
		const maps = this.store.roundById(stored.roundId)?.maps;
		if (!maps) return undefined;

		return winnerSideByScore({
			scores: scoresAfter(stored, scores),
			count: maps.count,
			countType: maps.type,
		});
	}

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
			this.store.markMatchChanged(nextMatches[0]);
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

		// Second match is the consolation final (SE) or a loser bracket match (DE).
		if (matchLocation === "single_bracket") {
			setNextOpponent(
				nextMatches[1],
				nextSide,
				match,
				winnerSide && helpers.getOtherSide(winnerSide),
			);
			this.store.markMatchChanged(nextMatches[1]);
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

	propagateByeWinners(match: MatchData): void {
		helpers.resolveByeWinner(match);
		this.store.markMatchChanged(match);

		if (helpers.hasBye(match)) this.updateRelatedMatches(match);
	}

	getRoundPositionalInfo(roundId: number): RoundPositionalInfo {
		const round = this.store.roundById(roundId);
		if (!round) throw Error("Round not found.");

		return {
			roundNumber: round.number,
			roundCount: this.store.roundCountInGroup(round.groupId),
		};
	}

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

	private getNextMatchesWB(
		match: MatchData,
		stage: StageData,
		roundNumber: number,
		roundCount: number,
	): (MatchData | null)[] {
		const loserBracket = this.getLoserBracket(match.stageId);
		if (loserBracket === null)
			// Only one match in the stage, there is no loser bracket.
			return [];

		const roundNumberLB = roundNumber > 1 ? (roundNumber - 1) * 2 : 1;

		const participantCount = this.participantCount(match.stageId);
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

		return [this.getDiagonalMatch(match.groupId, roundNumber, match.number)];
	}

	private getNextMatchesUpperBracketSingleElimination(
		match: MatchData,
		stageType: StageType,
		roundNumber: number,
		roundCount: number,
	): MatchData[] {
		if (roundNumber === roundCount - 1) {
			const final = this.getFirstMatchFinal(match, stageType);
			return [
				this.getDiagonalMatch(match.groupId, roundNumber, match.number),
				...(final ? [final] : []),
			];
		}

		if (roundNumber === roundCount) return [];

		return [this.getDiagonalMatch(match.groupId, roundNumber, match.number)];
	}

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

	/** First match of the final group (consolation final or grand final). */
	private getFirstMatchFinal(
		match: MatchData,
		stageType: StageType,
	): MatchData | null {
		const finalGroupId = this.getFinalGroupId(match.stageId, stageType);
		if (finalGroupId === null) return null;

		return this.findMatch(finalGroupId, 1, 1);
	}

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

		return [this.findMatch(match.groupId, roundNumber + 1, 1)];
	}

	private getMatchAfterMajorRoundLB(
		match: MatchData,
		roundNumber: number,
	): MatchData[] {
		return [this.getParallelMatch(match.groupId, roundNumber, match.number)];
	}

	private getMatchAfterMinorRoundLB(
		match: MatchData,
		roundNumber: number,
	): MatchData[] {
		return [this.getDiagonalMatch(match.groupId, roundNumber, match.number)];
	}

	private getFinalGroupId(
		stageId: number,
		stageType: StageType,
	): number | null {
		const groupNumber =
			stageType === "single_elimination"
				? 2 /* Consolation final */
				: 3; /* Grand final */
		const finalGroup = this.store.groupByNumber(stageId, groupNumber);
		if (!finalGroup) return null;
		return finalGroup.id;
	}

	/** The only bracket in single elimination, the winner bracket in double elimination. */
	private getUpperBracket(stageId: number): GroupData {
		const winnerBracket = this.store.groupByNumber(stageId, 1);
		if (!winnerBracket) throw Error("Winner bracket not found.");
		return winnerBracket;
	}

	/** Derived from the upper bracket's first round (two participants per match, BYEs included). */
	private participantCount(stageId: number): number {
		const upperBracket = this.getUpperBracket(stageId);
		const firstRound = this.store.roundByNumber(upperBracket.id, 1);
		if (!firstRound) throw Error("First round not found.");

		return this.store.matchCountInRound(firstRound.id) * 2;
	}

	private getLoserBracket(stageId: number): GroupData | null {
		return this.store.groupByNumber(stageId, 2);
	}

	/** Corresponding match in the next round, like Round 1 to Round 2 in single elimination. */
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

	/** Same match number in the next round, like major round to minor round in the loser bracket. */
	private getParallelMatch(
		groupId: number,
		roundNumber: number,
		matchNumber: number,
	): MatchData {
		return this.findMatch(groupId, roundNumber + 1, matchNumber);
	}

	findMatch(
		groupId: number,
		roundNumber: number,
		matchNumber: number,
	): MatchData {
		const round = this.store.roundByNumber(groupId, roundNumber);

		if (!round) throw Error("Round not found.");

		const match = this.store.matchByNumber(round.id, matchNumber);

		if (!match) throw Error("Match not found.");

		return match;
	}
}

function scoresAfter(
	stored: MatchData,
	scores: MatchResultsInput["scores"],
): [number, number] {
	if (scores === undefined) {
		return [stored.opponent1?.score ?? 0, stored.opponent2?.score ?? 0];
	}

	return scores ?? [0, 0];
}
