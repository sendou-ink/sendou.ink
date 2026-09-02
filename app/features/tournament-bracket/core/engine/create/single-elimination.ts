import type { Duel, ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import { ordering, STANDARD_BRACKET_FIRST_ROUND_ORDERING } from "./seeding";

/** One bracket and optionally a consolation final between semi-final losers. */
export function createSingleElimination(creator: StageCreator): void {
	const slots = creator.getSlots();
	const stage = creator.createStage();
	const ordered = ordering[STANDARD_BRACKET_FIRST_ROUND_ORDERING](slots);

	const { losers } = creator.createStandardBracket(stage.id, 1, ordered);
	createConsolationFinal(creator, stage.id, losers);
}

/** Consolation final for the semi final losers. */
function createConsolationFinal(
	creator: StageCreator,
	stageId: number,
	losers: ParticipantSlot[][],
): void {
	if (!creator.settings.consolationFinal) return;

	const semiFinalLosers = losers[losers.length - 2] as Duel;
	creator.createUniqueMatchBracket(stageId, 2, [semiFinalLosers]);
}
