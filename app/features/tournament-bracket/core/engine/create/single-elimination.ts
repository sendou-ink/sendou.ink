import type { Duel, ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import * as helpers from "./helpers";
import { ordering, STANDARD_BRACKET_FIRST_ROUND_ORDERING } from "./seeding";

/** One group per bracket (usually just one), each holding the bracket and optionally a consolation final between semi-final losers. */
export function createSingleElimination(creator: StageCreator): void {
	const groups = creator.getEliminationGroupSlots();
	const stage = creator.createStage();

	for (const [groupIdx, slots] of groups.entries()) {
		const groupId = creator.insertGroup({
			stageId: stage.id,
			number: groupIdx + 1,
		});
		const ordered = ordering[STANDARD_BRACKET_FIRST_ROUND_ORDERING](slots);

		const { losers } = creator.createStandardBracket(
			stage.id,
			groupId,
			ordered,
		);
		createConsolationFinal(creator, stage.id, groupId, slots, losers);
	}
}

/** Consolation final for the semi final losers. */
function createConsolationFinal(
	creator: StageCreator,
	stageId: number,
	groupId: number,
	slots: ParticipantSlot[],
	losers: ParticipantSlot[][],
): void {
	if (!creator.settings.consolationFinal) return;
	if (slots.filter((slot) => slot !== null).length < 4) return;

	const winnersRoundCount = helpers.getUpperBracketRoundCount(slots.length);
	if (
		!creator.isRoundCreated("winners", winnersRoundCount - 1, winnersRoundCount)
	)
		return;

	const semiFinalLosers = losers[losers.length - 2] as Duel;
	creator.createFinals(stageId, groupId, [semiFinalLosers]);
}
