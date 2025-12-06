import type { GroupType, Match, Stage } from "~/modules/brackets-model";
import { Status } from "~/modules/brackets-model";
import type { SetNextOpponent } from "../helpers";
import * as helpers from "../helpers";
import type { DeepPartial, Side } from "../types";
import { BaseGetter } from "./getter";

export class BaseUpdater extends BaseGetter {
	/**
	 * Updates the matches related (previous and next) to a match.
	 *
	 * @param match A match.
	 * @param updatePrevious Whether to update the previous matches.
	 * @param updateNext Whether to update the next matches.
	 */
	protected updateRelatedMatches(
		match: Match,
		updatePrevious: boolean,
		updateNext: boolean,
	): void {
		const { roundNumber, roundCount } = this.getRoundPositionalInfo(
			match.round_id,
		);

		const stage = this.storage.select("stage", match.stage_id);
		if (!stage) throw Error("Stage not found.");

		const group = this.storage.select("group", match.group_id);
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
	protected updateMatch(
		stored: Match,
		match: DeepPartial<Match>,
		force?: boolean,
	): void {
		if (!force && helpers.isMatchUpdateLocked(stored))
			throw Error("The match is locked.");

		const stage = this.storage.select("stage", stored.stage_id);
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
	 * Updates the opponents and status of a match and its child games.
	 *
	 * @param match A match.
	 */
	protected applyMatchUpdate(match: Match): void {
		if (!this.storage.update("match", match.id, match))
			throw Error("Could not update the match.");
	}

	/**
	 * Updates the match(es) leading to the current match based on this match results.
	 *
	 * @param match Input of the update.
	 * @param matchLocation Location of the current match.
	 * @param stage The parent stage.
	 * @param roundNumber Number of the round.
	 */
	protected updatePrevious(
		match: Match,
		matchLocation: GroupType,
		stage: Stage,
		roundNumber: number,
	): void {
		const previousMatches = this.getPreviousMatches(
			match,
			matchLocation,
			stage,
			roundNumber,
		);
		if (previousMatches.length === 0) return;

		if (match.status < Status.Running) {
			this.resetMatchesStatus(previousMatches);
		}
	}

	/**
	 * Resets the status of a list of matches to what it should currently be.
	 *
	 * @param matches The matches to update.
	 */
	protected resetMatchesStatus(matches: Match[]): void {
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
	protected updateNext(
		match: Match,
		matchLocation: GroupType,
		stage: Stage,
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
	protected applyToNextMatches(
		setNextOpponent: SetNextOpponent,
		match: Match,
		matchLocation: GroupType,
		roundNumber: number,
		roundCount: number,
		nextMatches: (Match | null)[],
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
	protected propagateByeWinners(match: Match): void {
		helpers.setMatchResults(match, match); // BYE propagation is only in non round-robin stages.
		this.applyMatchUpdate(match);

		if (helpers.hasBye(match)) this.updateRelatedMatches(match, true, true);
	}

	/**
	 * Unlocks matches in the next round of a round-robin group if both participants are ready.
	 *
	 * @param match The match that was just completed.
	 */
	protected unlockNextRoundRobinRound(match: Match): void {
		const round = this.storage.select("round", match.round_id);
		if (!round) throw Error("Round not found.");

		const nextRound = this.storage.selectFirst("round", {
			group_id: round.group_id,
			number: round.number + 1,
		});
		if (!nextRound) return;

		const currentRoundMatches = this.storage.select("match", {
			round_id: round.id,
		});
		if (!currentRoundMatches) return;

		const nextRoundMatches = this.storage.select("match", {
			round_id: nextRound.id,
		});
		if (!nextRoundMatches) return;

		for (const nextMatch of nextRoundMatches) {
			if (nextMatch.status !== Status.Locked) continue;

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
				nextMatch.status = Status.Ready;
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
	protected isParticipantReadyForNextRound(
		participantId: number,
		roundMatches: Match[],
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

		return participantMatch.status >= Status.Completed;
	}
}
