import type { Match } from "~/modules/brackets-model";
import { BaseUpdater } from "./base/updater";
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
}
