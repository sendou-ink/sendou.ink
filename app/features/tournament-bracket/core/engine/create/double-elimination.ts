import type { Duel, ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import * as helpers from "./helpers";
import { ordering, STANDARD_BRACKET_FIRST_ROUND_ORDERING } from "./seeding";

/** One group per bracket (usually just one), each holding the winner bracket (WB), loser bracket (LB) and a double grand final between the winners of both. */
export function createDoubleElimination(creator: StageCreator): void {
	const groups = creator.getEliminationGroupSlots();
	const stage = creator.createStage();

	for (const [groupIdx, slots] of groups.entries()) {
		const groupId = creator.insertGroup({
			stageId: stage.id,
			number: groupIdx + 1,
		});
		const ordered = ordering[STANDARD_BRACKET_FIRST_ROUND_ORDERING](slots);

		creator.createEliminationGroup("double_elimination", () => {
			const { losers: losersWb, winner: winnerWb } =
				creator.createStandardBracket(stage.id, groupId, ordered);

			if (helpers.isDoubleEliminationNecessary(slots.length)) {
				const winnerLb = creator.createLowerBracket(
					stage.id,
					groupId,
					losersWb,
					slots.length,
				);
				createGrandFinal(creator, stage.id, groupId, winnerWb, winnerLb);
			}
		});
	}
}

/** Double grand final for the winners of both brackets. */
function createGrandFinal(
	creator: StageCreator,
	stageId: number,
	groupId: number,
	winnerWb: ParticipantSlot,
	winnerLb: ParticipantSlot,
): void {
	const finalDuels: Duel[] = [
		[winnerWb, winnerLb],
		[{ id: null }, { id: null }],
	];

	creator.createFinals(stageId, groupId, finalDuels);
}
