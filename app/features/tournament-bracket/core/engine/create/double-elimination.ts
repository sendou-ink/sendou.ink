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

	if (creator.settings.skipFirstRound)
		createWithSkipFirstRound(creator, stage.id, ordered);
	else createWithoutSkipFirstRound(creator, stage.id, ordered);
}

/**
 * Creates a double elimination stage with skip first round option.
 */
function createWithSkipFirstRound(
	creator: StageCreator,
	stageId: number,
	slots: ParticipantSlot[],
): void {
	const { even: directInWb, odd: directInLb } = helpers.splitByParity(slots);
	const { losers: losersWb, winner: winnerWb } = creator.createStandardBracket(
		stageId,
		1,
		directInWb,
	);

	if (helpers.isDoubleEliminationNecessary(creator.settings.size!)) {
		const winnerLb = creator.createLowerBracket(stageId, 2, [
			directInLb,
			...losersWb,
		]);
		createGrandFinal(creator, stageId, winnerWb, winnerLb);
	}
}

/**
 * Creates a double elimination stage without skip first round option.
 */
function createWithoutSkipFirstRound(
	creator: StageCreator,
	stageId: number,
	slots: ParticipantSlot[],
): void {
	const { losers: losersWb, winner: winnerWb } = creator.createStandardBracket(
		stageId,
		1,
		slots,
	);

	if (helpers.isDoubleEliminationNecessary(creator.settings.size!)) {
		const winnerLb = creator.createLowerBracket(stageId, 2, losersWb);
		createGrandFinal(creator, stageId, winnerWb, winnerLb);
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
