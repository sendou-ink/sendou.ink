import type {
	CreateBracketInput,
	CreatedBracket,
	ResolvedCreateBracketInput,
} from "../types";
import { StageCreator } from "./builder";
import { createDoubleElimination } from "./double-elimination";
import { createRoundRobin } from "./round-robin";
import { resolveStageSettings } from "./settings";
import { createSingleElimination } from "./single-elimination";
import { createSwiss } from "./swiss";

/**
 * Generates the full structure for a new bracket of any type from the
 * user-selected settings. Pure function: returns rows with local ids
 * (0..n-1 per table); the repository maps them to real row ids on insert.
 * For swiss this includes the empty future rounds + round 1 matches.
 */
export function create(input: CreateBracketInput): CreatedBracket {
	return createResolved({
		tournamentId: input.tournamentId,
		name: input.name,
		type: input.type,
		seeding: input.seeding,
		settings: resolveStageSettings(input),
		abDivisions: input.abDivisions,
		number: input.number,
	});
}

/**
 * Engine-internal `create` taking already-resolved internal stage settings.
 * Tests use this to control knobs that are an implementation detail to the
 * app (seed ordering, byes balancing).
 */
export function createResolved(
	input: ResolvedCreateBracketInput,
): CreatedBracket {
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

	return creator.data;
}
