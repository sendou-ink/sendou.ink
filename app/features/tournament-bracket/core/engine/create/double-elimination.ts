import * as helpers from "../helpers";
import type { Duel, ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import { ordering } from "./seeding";

/**
 * Creates a double elimination stage.
 *
 * One upper bracket (winner bracket, WB), one lower bracket (loser bracket, LB) and a double grand final
 * between the winner of both brackets.
 */
export function createDoubleElimination(creator: StageCreator): void {
	if (
		Array.isArray(creator.settings.seedOrdering) &&
		creator.settings.seedOrdering.length < 1
	)
		throw Error("You must specify at least one seed ordering method.");

	const slots = creator.getSlots();
	const stage = creator.createStage();
	const method = creator.getStandardBracketFirstRoundOrdering();
	const ordered = ordering[method](slots);

	const { losers: losersWb, winner: winnerWb } = creator.createStandardBracket(
		stage.id,
		1,
		ordered,
	);

	if (helpers.isDoubleEliminationNecessary(creator.settings.size!)) {
		const winnerLb = creator.createLowerBracket(stage.id, 2, losersWb);
		createGrandFinal(creator, stage.id, winnerWb, winnerLb);
	}
}

/**
 * Creates a double grand final for winners of both brackets in a double elimination stage.
 */
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
