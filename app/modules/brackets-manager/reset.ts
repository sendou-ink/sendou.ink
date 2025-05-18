import { Status } from "~/modules/brackets-model";
import { BaseUpdater } from "./base/updater";
import * as helpers from "./helpers";

export class Reset extends BaseUpdater {
	/**
	 * Resets the results of a match.
	 *
	 * This will update related matches accordingly.
	 *
	 * @param matchId ID of the match.
	 */
	public matchResults(matchId: number): void {
		const stored = this.storage.select("match", matchId);
		if (!stored) throw Error("Match not found.");

		const stage = this.storage.select("stage", stored.stage_id);
		if (!stage) throw Error("Stage not found.");

		const group = this.storage.select("group", stored.group_id);
		if (!group) throw Error("Group not found.");

		const { roundNumber, roundCount } = this.getRoundPositionalInfo(
			stored.round_id,
		);
		const matchLocation = helpers.getMatchLocation(stage.type, group.number);
		const nextMatches =
			stage.type !== "round_robin" && stage.type !== "swiss"
				? this.getNextMatches(
						stored,
						matchLocation,
						stage,
						roundNumber,
						roundCount,
					)
				: [];

		if (
			nextMatches.some(
				(match) =>
					match &&
					match.status >= Status.Running &&
					!helpers.isMatchByeCompleted(match),
			)
		)
			throw Error("The match is locked.");

		helpers.resetMatchResults(stored);
		this.applyMatchUpdate(stored);

		if (!helpers.isRoundRobin(stage) && !helpers.isSwiss(stage))
			this.updateRelatedMatches(stored, true, true);
	}
}
