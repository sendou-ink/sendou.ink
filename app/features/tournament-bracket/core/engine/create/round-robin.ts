import type { ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import * as helpers from "./helpers";
import { ordering } from "./seeding";

/** Distributes participants in groups (count must be given) and rounds. */
export function createRoundRobin(creator: StageCreator): void {
	if (creator.settings.hasAbDivisions) {
		createAbDivisionRoundRobin(creator);
		return;
	}

	const groups = getRoundRobinGroups(creator);
	const stage = creator.createStage();

	for (let i = 0; i < groups.length; i++)
		creator.createRoundRobinGroup(stage.id, i + 1, groups[i]);
}

/** A/B divisions (`abDivisions`, parallel to the seeding): equal A and B teams per group, matches only pair A against B. */
function createAbDivisionRoundRobin(creator: StageCreator): void {
	const groups = getAbDivisionGroups(creator);
	const stage = creator.createStage();

	for (let i = 0; i < groups.length; i++)
		creator.createAbDivisionRoundRobinGroup(
			stage.id,
			i + 1,
			groups[i].a,
			groups[i].b,
		);
}

/** Slots in groups for a round-robin stage. */
function getRoundRobinGroups(creator: StageCreator): ParticipantSlot[][] {
	if (
		creator.settings.groupCount === undefined ||
		!Number.isInteger(creator.settings.groupCount)
	)
		throw Error("You must specify a group count for round-robin stages.");

	if (creator.settings.groupCount <= 0)
		throw Error("You must provide a strictly positive group count.");

	const slots = creator.getSlots();
	const ordered = ordering["groups.seed_optimized"](
		slots,
		creator.settings.groupCount,
	);
	return helpers.makeGroups(ordered, creator.settings.groupCount);
}

/** A and B pools distributed into groups with an equal number of each. */
function getAbDivisionGroups(creator: StageCreator): {
	a: ParticipantSlot[];
	b: ParticipantSlot[];
}[] {
	if (
		creator.settings.groupCount === undefined ||
		!Number.isInteger(creator.settings.groupCount)
	)
		throw Error("You must specify a group count for round-robin stages.");

	if (creator.settings.groupCount <= 0)
		throw Error("You must provide a strictly positive group count.");

	const abDivisions = creator.input.abDivisions;
	if (!abDivisions)
		throw Error("abDivisions must be provided when hasAbDivisions is enabled.");

	const slots = creator.getSlots();

	if (abDivisions.length !== slots.length)
		throw Error("abDivisions length must match the seeding length.");

	const divisionA: ParticipantSlot[] = [];
	const divisionB: ParticipantSlot[] = [];

	for (let i = 0; i < slots.length; i++) {
		const slot = slots[i];
		if (slot === null)
			throw Error("BYEs are not supported with A/B divisions.");

		const division = abDivisions[i];
		if (division === 0) divisionA.push(slot);
		else if (division === 1) divisionB.push(slot);
		else
			throw Error(
				`Participant at seed ${i + 1} is missing an A/B division assignment.`,
			);
	}

	return helpers.makeAbDivisionGroups(
		divisionA,
		divisionB,
		creator.settings.groupCount,
	);
}
