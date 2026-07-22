import type { Duel, ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import { ordering } from "./seeding";

/**
 * Creates a single elimination stage.
 *
 * One bracket and optionally a consolation final between semi-final losers.
 */
export function createSingleElimination(creator: StageCreator): void {
	if (
		Array.isArray(creator.settings.seedOrdering) &&
		creator.settings.seedOrdering.length !== 1
	)
		throw Error("You must specify one seed ordering method.");

	const slots = creator.getSlots();
	const stage = creator.createStage();
	const method = creator.getStandardBracketFirstRoundOrdering();
	const ordered = ordering[method](slots);

	const { losers } = creator.createStandardBracket(stage.id, 1, ordered);
	createConsolationFinal(creator, stage.id, losers);
}

/**
 * Creates a consolation final for the semi final losers of a single elimination stage.
 */
function createConsolationFinal(
	creator: StageCreator,
	stageId: number,
	losers: ParticipantSlot[][],
): void {
	if (!creator.settings.consolationFinal) return;

	const semiFinalLosers = losers[losers.length - 2] as Duel;
	creator.createUniqueMatchBracket(stageId, 2, [semiFinalLosers]);
}
