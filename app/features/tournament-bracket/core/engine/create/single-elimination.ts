import type { Duel, ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import { ordering, STANDARD_BRACKET_FIRST_ROUND_ORDERING } from "./seeding";

/** One group holding the bracket and optionally a consolation final between semi-final losers. */
export function createSingleElimination(creator: StageCreator): void {
	const slots = creator.getSlots();
	const stage = creator.createStage();
	const groupId = creator.insertGroup({ stageId: stage.id, number: 1 });
	const ordered = ordering[STANDARD_BRACKET_FIRST_ROUND_ORDERING](slots);

	const { losers } = creator.createStandardBracket(stage.id, groupId, ordered);
	createConsolationFinal(creator, stage.id, groupId, losers);
}

/** Consolation final for the semi final losers. */
function createConsolationFinal(
	creator: StageCreator,
	stageId: number,
	groupId: number,
	losers: ParticipantSlot[][],
): void {
	if (!creator.settings.consolationFinal) return;

	const semiFinalLosers = losers[losers.length - 2] as Duel;
	creator.createFinals(stageId, groupId, [semiFinalLosers]);
}
