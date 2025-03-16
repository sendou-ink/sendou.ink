import type { Match, Round, SeedOrdering } from "~/modules/brackets-model";
import { Status } from "~/modules/brackets-model";
import { BaseUpdater } from "./base/updater";
import * as helpers from "./helpers";
import { ordering } from "./ordering";
import type { DeepPartial } from "./types";

export class Update extends BaseUpdater {
	/**
	 * Updates partial information of a match. Its id must be given.
	 *
	 * This will update related matches accordingly.
	 *
	 * @param match Values to change in a match.
	 */
	public match<M extends Match = Match>(match: DeepPartial<M>): void {
		if (match.id === undefined) throw Error("No match id given.");

		const stored = this.storage.select("match", match.id);
		if (!stored) throw Error("Match not found.");

		this.updateMatch(stored, match);
	}

	/**
	 * Updates the seed ordering of every ordered round in a stage.
	 *
	 * @param stageId ID of the stage.
	 * @param seedOrdering A list of ordering methods.
	 */
	public ordering(stageId: number, seedOrdering: SeedOrdering[]): void {
		const stage = this.storage.select("stage", stageId);
		if (!stage) throw Error("Stage not found.");

		helpers.ensureNotRoundRobin(stage);

		const roundsToOrder = this.getOrderedRounds(stage);
		if (seedOrdering.length !== roundsToOrder.length)
			throw Error("The count of seed orderings is incorrect.");

		for (let i = 0; i < roundsToOrder.length; i++)
			this.updateRoundOrdering(roundsToOrder[i], seedOrdering[i]);
	}

	/**
	 * Updates the seed ordering of a round.
	 *
	 * @param roundId ID of the round.
	 * @param method Seed ordering method.
	 */
	public roundOrdering(roundId: number, method: SeedOrdering): void {
		const round = this.storage.select("round", roundId);
		if (!round) throw Error("This round does not exist.");

		const stage = this.storage.select("stage", round.stage_id);
		if (!stage) throw Error("Stage not found.");

		helpers.ensureNotRoundRobin(stage);

		this.updateRoundOrdering(round, method);
	}

	/**
	 * Update the seed ordering of a round.
	 *
	 * @param round The round of which to update the ordering.
	 * @param method The new ordering method.
	 */
	private updateRoundOrdering(round: Round, method: SeedOrdering): void {
		const matches = this.storage.select("match", { round_id: round.id });
		if (!matches) throw Error("This round has no match.");

		if (matches.some((match) => match.status > Status.Ready))
			throw Error("At least one match has started or is completed.");

		const stage = this.storage.select("stage", round.stage_id);
		if (!stage) throw Error("Stage not found.");
		if (stage.settings.size === undefined) throw Error("Undefined stage size.");

		const group = this.storage.select("group", round.group_id);
		if (!group) throw Error("Group not found.");

		const inLoserBracket = helpers.isLoserBracket(stage.type, group.number);
		const roundCountLB = helpers.getLowerBracketRoundCount(stage.settings.size);
		const seeds = helpers.getSeeds(
			inLoserBracket,
			round.number,
			roundCountLB,
			matches.length,
		);
		const positions = ordering[method](seeds);

		this.applyRoundOrdering(round.number, matches, positions);
	}

	/**
	 * Updates the ordering of participants in a round's matches.
	 *
	 * @param roundNumber The number of the round.
	 * @param matches The matches of the round.
	 * @param positions The new positions.
	 */
	private applyRoundOrdering(
		roundNumber: number,
		matches: Match[],
		positions: number[],
	): void {
		for (const match of matches) {
			const updated = { ...match };
			updated.opponent1 = helpers.findPosition(matches, positions.shift()!);

			// The only rounds where we have a second ordered participant are first rounds of brackets (upper and lower).
			if (roundNumber === 1)
				updated.opponent2 = helpers.findPosition(matches, positions.shift()!);

			if (!this.storage.update("match", updated.id, updated))
				throw Error("Could not update the match.");
		}
	}
}
