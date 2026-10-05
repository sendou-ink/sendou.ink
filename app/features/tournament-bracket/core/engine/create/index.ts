import type { TournamentRoundMaps } from "~/db/tables-json";
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
 * Full structure of a new bracket with local ids (0..n-1 per table) the repository maps to row ids on
 * insert. Swiss gets its empty future rounds + round 1 matches.
 */
export function create(input: CreateBracketInput): BracketData {
	const data = createResolved({
		type: input.type,
		seeding: input.seeding,
		settings: {
			...resolveStageSettings(input),
			...(input.isRealtime ? { isRealtime: true } : {}),
		},
		abDivisions: input.abDivisions,
		number: input.number,
	});

	if (input.maps) {
		attachRoundMaps(data, input.maps, input.type);
	}

	return data;
}

/** `create` with resolved internal settings, letting tests control seed ordering and byes balancing. */
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
			throw new Error("Unknown stage type.");
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
		if (!round)
			throw new Error(`No round found for map list round id ${roundId}`);
		return round;
	};

	if (type === "round_robin" || type === "swiss") {
		// groups share one map list per round number and can have different round counts
		const distinctRoundNumberCount = new Set(
			data.round.map((round) => round.number),
		).size;
		if (mapsInput.length !== distinctRoundNumberCount) {
			throw new Error("Invalid map list count");
		}

		const inputByRoundNumber = new Map(
			mapsInput.map((input) => [resolveRound(input.roundId).number, input]),
		);

		for (const round of data.round) {
			const input = inputByRoundNumber.get(round.number);
			if (!input)
				throw new Error(`No maps found for round number ${round.number}`);
			round.maps = toRoundMaps(input);
			round.isPlayableAt = input.isPlayableAt ?? null;
		}

		return;
	}

	// groups share one map list per section and position from its end (a smaller group drops its earliest rounds),
	// so one group's rounds having maps is enough
	const keyOfRound = eliminationMapListKeys(data);
	const inputByRoundId = new Map(
		mapsInput.map((input) => [resolveRound(input.roundId).id, input]),
	);
	const inputByKey = new Map(
		mapsInput.map((input) => [keyOfRound.get(input.roundId), input]),
	);

	for (const round of data.round) {
		const input =
			inputByRoundId.get(round.id) ?? inputByKey.get(keyOfRound.get(round.id));
		if (!input) throw new Error(`Round id ${round.id} is missing maps`);

		round.maps = toRoundMaps(input);
		round.isPlayableAt = input.isPlayableAt ?? null;
	}
}

/** Round id -> key shared by the rounds of every group that use the same map list. */
function eliminationMapListKeys(data: BracketData) {
	const result = new Map<number, string>();

	for (const round of data.round) {
		const lastRoundNumber = Math.max(
			...data.round
				.filter(
					(candidate) =>
						candidate.groupId === round.groupId &&
						candidate.section === round.section,
				)
				.map((candidate) => candidate.number),
		);

		result.set(round.id, `${round.section}-${lastRoundNumber - round.number}`);
	}

	return result;
}

function toRoundMaps(input: RoundMapsInput): TournamentRoundMaps {
	const { roundId, section, isPlayableAt, ...maps } = input;
	return maps;
}
