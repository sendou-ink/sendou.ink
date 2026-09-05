import type { Duel, ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import * as helpers from "./helpers";
import { ordering, STANDARD_BRACKET_FIRST_ROUND_ORDERING } from "./seeding";

/** Winner bracket (WB), loser bracket (LB) and a double grand final between the winners of both. */
export function createDoubleElimination(creator: StageCreator): void {
	const slots = creator.getSlots();
	const stage = creator.createStage();
	const ordered = ordering[STANDARD_BRACKET_FIRST_ROUND_ORDERING](slots);

	const { losers: losersWb, winner: winnerWb } = creator.createStandardBracket(
		stage.id,
		1,
		ordered,
	);

	if (helpers.isDoubleEliminationNecessary(slots.length)) {
		const winnerLb = creator.createLowerBracket(stage.id, 2, losersWb);
		createGrandFinal(creator, stage.id, winnerWb, winnerLb);
	}
}

/** Double grand final for the winners of both brackets. */
function createGrandFinal(
	creator: StageCreator,
	stageId: number,
	winnerWb: ParticipantSlot,
	winnerLb: ParticipantSlot,
): void {
	const finalDuels: Duel[] = [
		[winnerWb, winnerLb],
		[{ id: null }, { id: null }],
	];

	creator.createUniqueMatchBracket(stageId, 3, finalDuels);
}
