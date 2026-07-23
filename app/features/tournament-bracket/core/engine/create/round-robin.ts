import * as helpers from "../helpers";
import type { ParticipantSlot } from "../types";
import type { StageCreator } from "./builder";
import { ordering } from "./seeding";

/**
 * Creates a round-robin stage.
 *
 * Group count must be given. It will distribute participants in groups and rounds.
 */
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

/**
 * Creates a bipartite (A/B divisions) round-robin stage.
 *
 * Participants are partitioned into two pools by `abDivisions` (parallel to the seeding).
 * Each group receives equal A and B teams, and matches only pair A against B.
 */
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

/**
 * Gets the slots in groups for a round-robin stage.
 */
function getRoundRobinGroups(creator: StageCreator): ParticipantSlot[][] {
	if (
		creator.settings.groupCount === undefined ||
		!Number.isInteger(creator.settings.groupCount)
	)
		throw Error("You must specify a group count for round-robin stages.");

	if (creator.settings.groupCount <= 0)
		throw Error("You must provide a strictly positive group count.");

	if (creator.settings.manualOrdering) {
		if (creator.settings.manualOrdering.length !== creator.settings.groupCount)
			throw Error(
				"Group count in the manual ordering does not correspond to the given group count.",
			);

		const positions = creator.settings.manualOrdering.flat();
		const slots = creator.getSlots(positions);

		return helpers.makeGroups(slots, creator.settings.groupCount);
	}

	const slots = creator.getSlots();
	const ordered = ordering["groups.seed_optimized"](
		slots,
		creator.settings.groupCount,
	);
	return helpers.makeGroups(ordered, creator.settings.groupCount);
}

/**
 * Partitions the seeded slots into A and B pools then distributes them into groups
 * such that each group has an equal number of A and B participants.
 */
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
