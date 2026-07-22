import type { CreateBracketInput, CreatedBracket } from "../types";
import { StageCreator } from "./builder";
import { createDoubleElimination } from "./double-elimination";
import { createRoundRobin } from "./round-robin";
import { createSingleElimination } from "./single-elimination";
import { createSwiss } from "./swiss";

/**
 * Generates the full structure for a new bracket of any type. Pure function:
 * returns rows with local ids (0..n-1 per table); the repository maps them to
 * real row ids on insert. For swiss this includes the empty future rounds +
 * round 1 matches.
 */
export function create(input: CreateBracketInput): CreatedBracket {
	if (input.type === "swiss") return createSwiss(input);

	const creator = new StageCreator(input);

	switch (input.type) {
		case "round_robin":
			createRoundRobin(creator);
			break;
		case "single_elimination":
			createSingleElimination(creator);
			break;
		case "double_elimination":
			createDoubleElimination(creator);
			break;
		default:
			throw Error("Unknown stage type.");
	}

	// xxx: hmm, what?
	creator.ensureSeedOrdering();

	return creator.data;
}
