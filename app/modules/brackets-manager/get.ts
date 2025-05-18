import type { Group, Match, Round, Stage } from "~/modules/brackets-model";
import { BaseGetter } from "./base/getter";
import type { Database } from "./types";

export class Get extends BaseGetter {
	/**
	 * Returns the data needed to display a stage.
	 *
	 * @param stageId ID of the stage.
	 */
	public stageData(stageId: number): Database {
		const stageData = this.getStageSpecificData(stageId);

		return {
			stage: [stageData.stage],
			group: stageData.groups,
			round: stageData.rounds,
			match: stageData.matches,
		};
	}

	/**
	 * Returns the data needed to display a whole tournament with all its stages.
	 *
	 * @param tournamentId ID of the tournament.
	 */
	public tournamentData(tournamentId: number): Database {
		const stages = this.storage.select("stage", {
			tournament_id: tournamentId,
		});
		if (!stages) throw Error("Error getting stages.");

		const stagesData = stages.map((stage) =>
			this.getStageSpecificData(stage.id),
		);

		return {
			stage: stages,
			group: stagesData.flatMap((data) => data.groups),
			round: stagesData.flatMap((data) => data.rounds),
			match: stagesData.flatMap((data) => data.matches),
		};
	}

	/**
	 * Returns only the data specific to the given stage (without the participants).
	 *
	 * @param stageId ID of the stage.
	 */
	private getStageSpecificData(stageId: number): {
		stage: Stage;
		groups: Group[];
		rounds: Round[];
		matches: Match[];
	} {
		const stage = this.storage.select("stage", stageId);
		if (!stage) throw Error("Stage not found.");

		const groups = this.storage.select("group", { stage_id: stageId });
		if (!groups) throw Error("Error getting groups.");

		const rounds = this.storage.select("round", { stage_id: stageId });
		if (!rounds) throw Error("Error getting rounds.");

		const matches = this.storage.select("match", { stage_id: stageId });
		if (!matches) throw Error("Error getting matches.");

		return {
			stage,
			groups,
			rounds,
			matches,
		};
	}
}
