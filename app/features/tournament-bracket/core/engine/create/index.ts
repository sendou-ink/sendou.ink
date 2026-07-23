import type { TournamentRoundMaps } from "~/db/tables";
import type {
	BracketData,
	CreateBracketInput,
	ResolvedCreateBracketInput,
	RoundMapsInput,
	StageType,
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
export function create(input: CreateBracketInput): BracketData {
	const data = createResolved({
		tournamentId: input.tournamentId,
		name: input.name,
		type: input.type,
		seeding: input.seeding,
		settings: resolveStageSettings(input),
		abDivisions: input.abDivisions,
		number: input.number,
	});

	if (input.maps) {
		attachRoundMaps(data, input.maps, input.type);
	}

	return data;
}

/**
 * Engine-internal `create` taking already-resolved internal stage settings.
 * Tests use this to control knobs that are an implementation detail to the
 * app (seed ordering, byes balancing).
 */
export function createResolved(input: ResolvedCreateBracketInput): BracketData {
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

function attachRoundMaps(
	data: BracketData,
	mapsInput: RoundMapsInput[],
	type: StageType,
) {
	const roundsById = new Map(data.round.map((round) => [round.id, round]));

	const resolveRound = (roundId: number) => {
		const round = roundsById.get(roundId);
		if (!round) throw Error(`No round found for map list round id ${roundId}`);
		return round;
	};

	if (type === "round_robin" || type === "swiss") {
		// groups share one map list per round number, and groups can have
		// different round counts when teams divide unevenly
		const distinctRoundNumberCount = new Set(
			data.round.map((round) => round.number),
		).size;
		if (mapsInput.length !== distinctRoundNumberCount) {
			throw Error("Invalid map list count");
		}

		const mapsByRoundNumber = new Map(
			mapsInput.map((input) => [
				resolveRound(input.roundId).number,
				toRoundMaps(input),
			]),
		);

		for (const round of data.round) {
			const maps = mapsByRoundNumber.get(round.number);
			if (!maps) throw Error(`No maps found for round number ${round.number}`);
			round.maps = { ...maps };
		}

		return;
	}

	if (mapsInput.length !== data.round.length) {
		throw Error("Invalid map list count");
	}

	for (const input of mapsInput) {
		resolveRound(input.roundId).maps = toRoundMaps(input);
	}

	for (const round of data.round) {
		if (!round.maps) throw Error(`Round id ${round.id} is missing maps`);
	}
}

function toRoundMaps(input: RoundMapsInput): TournamentRoundMaps {
	const { roundId, groupId, ...maps } = input;
	return maps;
}
