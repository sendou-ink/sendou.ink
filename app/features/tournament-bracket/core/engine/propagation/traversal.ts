import { matchStatus, winnerSideByScore } from "../status";
import type {
	GroupType,
	MatchData,
	MatchResultsInput,
	RoundSection,
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
		if (!stage) throw new Error("Stage not found.");

		const matchLocation = helpers.getMatchLocation(
			stage.type,
			this.sectionOf(match),
		);

		this.updateNext(match, matchLocation, stage, roundNumber, roundCount);
	}

	/** @param force Also update matches that can't be played yet. */
	updateMatch(
		stored: MatchData,
		input: MatchResultsInput,
		force?: boolean,
	): void {
		if (!force && matchStatus(this.store.data, stored.id) === "PENDING")
			throw new Error("The match is locked.");

		const stage = this.store.stageById(stored.stageId);
		if (!stage) throw new Error("Stage not found.");

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
			if (!nextMatches[0]) throw new Error("First next match is null.");
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
		if (!nextMatches[1]) throw new Error("Second next match is null.");

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

	/** Round number and count within the round's section (a round robin group's rounds, the losers bracket...). */
	getRoundPositionalInfo(roundId: number): RoundPositionalInfo {
		const round = this.store.roundById(roundId);
		if (!round) throw new Error("Round not found.");

		return {
			roundNumber: round.number,
			roundCount: this.store.roundCountInSection(round.groupId, round.section),
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
				return this.getNextMatchesLB(match, roundNumber, roundCount);
			case "final_group":
				return this.getNextMatchesFinal(match, roundNumber, roundCount);
			default:
				throw new Error("Unknown bracket kind.");
		}
	}

	private getNextMatchesWB(
		match: MatchData,
		stage: StageData,
		roundNumber: number,
		roundCount: number,
	): (MatchData | null)[] {
		if (!this.hasSection(match.groupId, "losers"))
			// Only one match in the stage, there is no loser bracket.
			return [];

		const roundNumberLB = roundNumber > 1 ? (roundNumber - 1) * 2 : 1;

		const participantCount = this.participantCount(match.groupId);
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
			this.findMatch(
				match.groupId,
				"losers",
				roundNumberLB,
				actualMatchNumberLB,
			),
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
				roundNumber,
				roundCount,
			);

		if (stageType === "double_elimination" && roundNumber === roundCount)
			return [this.getFirstMatchFinal(match)];

		return [this.getDiagonalMatch(match, roundNumber)];
	}

	private getNextMatchesUpperBracketSingleElimination(
		match: MatchData,
		roundNumber: number,
		roundCount: number,
	): MatchData[] {
		if (roundNumber === roundCount - 1) {
			const final = this.getFirstMatchFinal(match);
			return [
				this.getDiagonalMatch(match, roundNumber),
				...(final ? [final] : []),
			];
		}

		if (roundNumber === roundCount) return [];

		return [this.getDiagonalMatch(match, roundNumber)];
	}

	private getNextMatchesLB(
		match: MatchData,
		roundNumber: number,
		roundCount: number,
	): MatchData[] {
		if (roundNumber === roundCount) {
			const final = this.getFirstMatchFinal(match);
			return final ? [final] : [];
		}

		if (roundNumber % 2 === 1)
			return [this.getParallelMatch(match, roundNumber)];

		return [this.getDiagonalMatch(match, roundNumber)];
	}

	/** First match of the finals section (consolation final or grand final) of the match's group. */
	private getFirstMatchFinal(match: MatchData): MatchData | null {
		if (!this.hasSection(match.groupId, "finals")) return null;

		return this.findMatch(match.groupId, "finals", 1, 1);
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

		return [this.findMatch(match.groupId, "finals", roundNumber + 1, 1)];
	}

	/** Derived from the winners section's first round (two participants per match, BYEs included). */
	private participantCount(groupId: number): number {
		const firstRound = this.store.roundByNumber(groupId, "winners", 1);
		if (!firstRound) throw new Error("First round not found.");

		return this.store.matchCountInRound(firstRound.id) * 2;
	}

	private hasSection(groupId: number, section: RoundSection): boolean {
		return this.store.roundCountInSection(groupId, section) > 0;
	}

	private sectionOf(match: MatchData): RoundSection | null {
		const round = this.store.roundById(match.roundId);
		if (!round) throw new Error("Round not found.");

		return round.section;
	}

	/** Corresponding match in the next round, like Round 1 to Round 2 in single elimination. */
	private getDiagonalMatch(match: MatchData, roundNumber: number): MatchData {
		return this.findMatch(
			match.groupId,
			this.sectionOf(match),
			roundNumber + 1,
			helpers.getDiagonalMatchNumber(match.number),
		);
	}

	/** Same match number in the next round, like major round to minor round in the loser bracket. */
	private getParallelMatch(match: MatchData, roundNumber: number): MatchData {
		return this.findMatch(
			match.groupId,
			this.sectionOf(match),
			roundNumber + 1,
			match.number,
		);
	}

	findMatch(
		groupId: number,
		section: RoundSection | null,
		roundNumber: number,
		matchNumber: number,
	): MatchData {
		const round = this.store.roundByNumber(groupId, section, roundNumber);

		if (!round) throw new Error("Round not found.");

		const match = this.store.matchByNumber(round.id, matchNumber);

		if (!match) throw new Error("Match not found.");

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
