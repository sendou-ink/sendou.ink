/** Map list generation logic for "TO pick" as in the map list is defined beforehand by TO and teams don't pick */

import clone from "just-clone";
import shuffle from "just-shuffle";
import type { Tables, TournamentRoundMaps } from "~/db/tables";
import type { Round } from "~/modules/brackets-model";
import type { ModeShort, StageId } from "~/modules/in-game-lists";
import { SENDOUQ_DEFAULT_MAPS } from "~/modules/tournament-map-list-generator/constants";
import { removeDuplicates } from "~/utils/arrays";
import { logger } from "~/utils/logger";
import { assertUnreachable } from "~/utils/types";

export type BracketMapCounts = Map<
	// round.group_id ->
	number,
	// round.number ->
	Map<number, { count: number; type: "BEST_OF" }>
>;

export interface GenerateTournamentRoundMaplistArgs {
	pool: Array<{ mode: ModeShort; stageId: StageId }>;
	rounds: Round[];
	mapCounts: BracketMapCounts;
	type: Tables["TournamentStage"]["type"];
	roundsWithPickBan: Set<number>;
	pickBanStyle: TournamentRoundMaps["pickBan"];
	flavor: "SZ_FIRST" | null;
}

export type TournamentRoundMapList = ReturnType<
	typeof generateTournamentRoundMaplist
>;

// TODO: future improvement could be slightly biasing against maps that appear in slots that are not guaranteed to be played
export function generateTournamentRoundMaplist(
	args: GenerateTournamentRoundMaplistArgs,
) {
	// in round robin different group ids represent different groups
	// but they share the map list
	const filteredRounds = getFilteredRounds(args.rounds, args.type);

	// sort rounds in a way that allows us to space maps out
	// so in the typical order that people play out the tournament
	const sortedRounds = sortRounds(filteredRounds, args.type);

	const modeFrequency = new Map<ModeShort, number>();
	const stageAppearance = new Map<StageId, number>();
	const comboAppearance = new Map<string, number>();

	//                roundId
	const result: Map<number, Omit<TournamentRoundMaps, "type">> = new Map();

	for (const [iteration, round] of sortedRounds.entries()) {
		const count = resolveRoundMapCount(round, args.mapCounts, args.type);

		const amountOfMapsToGenerate = () => {
			if (!args.roundsWithPickBan.has(round.id) || !args.pickBanStyle) {
				return count;
			}
			if (args.pickBanStyle === "COUNTERPICK") return 1;
			if (args.pickBanStyle === "BAN_2") return count + 2;

			assertUnreachable(args.pickBanStyle);
		};
		const modes = modeOrder({
			count: amountOfMapsToGenerate(),
			pool: args.pool,
			modeFrequency,
			iteration,
			flavor: args.flavor,
		});

		result.set(round.id, {
			count,
			pickBan: args.roundsWithPickBan.has(round.id)
				? args.pickBanStyle
				: undefined,
			list:
				// teams pick
				args.pool.length === 0
					? null
					: // TO pick
						modes.map((mode) => ({
							mode,
							stageId: resolveStage(
								mode,
								args.pool,
								stageAppearance,
								comboAppearance,
								iteration,
							),
						})),
		});
	}

	return result;
}

function getFilteredRounds(
	rounds: Round[],
	type: Tables["TournamentStage"]["type"],
) {
	if (type !== "round_robin" && type !== "swiss") return rounds;

	// highest group id because lower group id's can have byes that higher don't
	const highestGroupId = Math.max(...rounds.map((x) => x.group_id));
	return rounds.filter((x) => x.group_id === highestGroupId);
}

function sortRounds(rounds: Round[], type: Tables["TournamentStage"]["type"]) {
	return rounds.slice().sort((a, b) => {
		if (type === "double_elimination") {
			// grands last
			const maxGroupId = Math.max(...rounds.map((x) => x.group_id));
			if (a.group_id === maxGroupId && b.group_id !== maxGroupId) return 1;
			if (a.group_id !== maxGroupId && b.group_id === maxGroupId) return -1;
		}
		if (type === "single_elimination") {
			// finals and 3rd place match last
			if (a.group_id !== b.group_id) return a.group_id - b.group_id;
		}

		return a.number - b.number;
	});
}

function resolveRoundMapCount(
	round: Round,
	counts: BracketMapCounts,
	type: Tables["TournamentStage"]["type"],
) {
	// with rr/swiss we just take the first group id
	// as every group has the same map list
	const groupId =
		type === "round_robin" || type === "swiss"
			? Math.max(...Array.from(counts.keys()))
			: round.group_id;

	const count = counts.get(groupId)?.get(round.number)?.count;
	if (typeof count === "undefined") {
		logger.warn(
			`No map count found for round ${round.number} (group ${round.group_id})`,
		);
		return 5;
	}

	return count;
}

function modeOrder({
	count,
	pool,
	modeFrequency,
	iteration,
	flavor,
}: {
	count: number;
	pool: GenerateTournamentRoundMaplistArgs["pool"];
	modeFrequency: Map<ModeShort, number>;
	iteration: number;
	flavor: GenerateTournamentRoundMaplistArgs["flavor"];
}) {
	const modes = removeDuplicates(pool.map((x) => x.mode));
	const shuffledModes = shuffle(modes);
	shuffledModes.sort((a, b) => {
		const aFreq = modeFrequency.get(a) ?? 0;
		const bFreq = modeFrequency.get(b) ?? 0;

		return aFreq - bFreq;
	});

	const biasedModes = modesWithSZBiased({ modes: shuffledModes, flavor });

	const result: ModeShort[] = [];

	let currentI = 0;
	while (result.length < count) {
		result.push(biasedModes[currentI]);
		modeFrequency.set(biasedModes[currentI], iteration);
		currentI++;
		if (currentI >= biasedModes.length) {
			currentI = 0;
		}
	}

	return result;
}

function modesWithSZBiased({
	modes,
	flavor,
}: {
	modes: ModeShort[];
	flavor?: GenerateTournamentRoundMaplistArgs["flavor"];
}) {
	// map list without SZ
	if (!modes.includes("SZ")) {
		return modes;
	}

	if (flavor === "SZ_FIRST" && modes.includes("SZ")) {
		const result: ModeShort[] = clone(modes);
		const szIndex = result.indexOf("SZ");
		result.splice(szIndex, 1);
		result.unshift("SZ");
		return result;
	}

	// not relevant if there are less than 4 modes
	if (modes.length < 4) {
		return modes;
	}

	if (modes[0] === "SZ" || modes[1] === "SZ" || modes[2] === "SZ") {
		return modes;
	}

	const result: ModeShort[] = modes.filter((mode) => mode !== "SZ");

	const szIndex = Math.floor(Math.random() * 3);
	result.splice(szIndex, 0, "SZ");

	return result;
}

const serializedMap = (mode: ModeShort, stage: StageId) => `${mode}-${stage}`;

function resolveStage(
	mode: ModeShort,
	pool: GenerateTournamentRoundMaplistArgs["pool"],
	stageAppearance: Map<StageId, number>,
	comboAppearance: Map<string, number>,
	currentIteration: number,
) {
	const allOptions = pool.filter((x) => x.mode === mode).map((x) => x.stageId);

	let equallyGoodOptionsIgnoringCombo: StageId[] = [];
	{
		let earliestAppearance = Number.POSITIVE_INFINITY;
		for (const option of allOptions) {
			const appearance = stageAppearance.get(option) ?? -1;
			if (appearance < earliestAppearance) {
				earliestAppearance = appearance;
				equallyGoodOptionsIgnoringCombo = [];
			}

			if (appearance === earliestAppearance) {
				equallyGoodOptionsIgnoringCombo.push(option);
			}
		}
	}

	let bestOptions: StageId[] = [];
	{
		let earliestAppearance = Number.POSITIVE_INFINITY;
		for (const option of equallyGoodOptionsIgnoringCombo) {
			const appearance = comboAppearance.get(serializedMap(mode, option)) ?? -1;
			if (appearance < earliestAppearance) {
				earliestAppearance = appearance;
				bestOptions = [];
			}

			if (appearance === earliestAppearance) {
				bestOptions.push(option);
			}
		}
	}

	const stage = shuffle(equallyGoodOptionsIgnoringCombo)[0];
	if (typeof stage !== "number") {
		const fallback = shuffle(SENDOUQ_DEFAULT_MAPS[mode].slice())[0];
		logger.warn(
			`No stage found for mode ${mode} iteration ${currentIteration}, using fallback ${fallback}`,
		);
		return fallback;
	}

	stageAppearance.set(stage, currentIteration);
	comboAppearance.set(
		serializedMap(mode, stage),
		(comboAppearance.get(serializedMap(mode, stage)) ?? 0) + 1,
	);

	return stage;
}
