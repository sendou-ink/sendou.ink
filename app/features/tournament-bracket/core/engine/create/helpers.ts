import type { Duel, ParticipantSlot, SeedOrdering, StageType } from "../types";
import { ordering } from "./seeding";

/**
 * Makes a list of rounds containing the matches of a round-robin group.
 *
 * @param participants The participants to distribute.
 * @param mode The round-robin mode.
 */
export function makeRoundRobinMatches<T>(participants: T[]): [T, T][][] {
	const n = participants.length;
	const n1 = n % 2 === 0 ? n : n + 1;
	const roundCount = n1 - 1;
	const matchPerRound = n1 / 2;

	const rounds: [T, T][][] = [];

	for (let roundId = 0; roundId < roundCount; roundId++) {
		const matches: [T, T][] = [];

		for (let matchId = 0; matchId < matchPerRound; matchId++) {
			if (matchId === 0 && n % 2 === 1) continue;

			const opponentsIds = [
				(roundId - matchId - 1 + n1) % (n1 - 1),
				matchId === 0 ? n1 - 1 : (roundId + matchId) % (n1 - 1),
			];

			matches.push([
				participants[opponentsIds[0]],
				participants[opponentsIds[1]],
			]);
		}

		rounds.push(matches);
	}

	return rounds;
}

/**
 * Makes a list of rounds containing the matches of a bipartite (A/B divisions) round-robin group.
 *
 * Every A team plays every B team exactly once; there are no A-vs-A or B-vs-B matches.
 * Round 1 is cross-seeded (strongest A vs weakest B), and B is rotated cyclically downward
 * in each subsequent round.
 *
 * When the divisions have different sizes, the shorter side is padded with bye slots so the
 * rotation still works. Those bye pairings are filtered out of the output, so each round has
 * exactly `min(|A|, |B|)` real matches and the total is `|A| * |B|`.
 *
 * @param divisionA Participants in division A, ordered by seed.
 * @param divisionB Participants in division B, ordered by seed.
 */
export function makeAbDivisionRoundRobinMatches<T>(
	divisionA: T[],
	divisionB: T[],
): [T, T][][] {
	const n = Math.max(divisionA.length, divisionB.length);
	const paddedA: (T | null)[] = [
		...divisionA,
		...Array(n - divisionA.length).fill(null),
	];
	const paddedB: (T | null)[] = [
		...divisionB,
		...Array(n - divisionB.length).fill(null),
	];
	const rounds: [T, T][][] = [];

	for (let roundIdx = 0; roundIdx < n; roundIdx++) {
		const matches: [T, T][] = [];

		for (let i = 0; i < n; i++) {
			const bIdx = (((n - 1 - i - roundIdx) % n) + n) % n;
			const a = paddedA[i];
			const b = paddedB[bIdx];
			if (a === null || b === null) continue;
			matches.push([a, b]);
		}

		rounds.push(matches);
	}

	return rounds;
}

/**
 * Distributes A/B division participants into groups such that each group has an
 * equal number of A and B participants.
 *
 * The snake ordering used by `groups.seed_optimized` is applied independently to
 * each pool, so that relative seed order within each pool is preserved within
 * every group.
 *
 * @param divisionA Participants in division A, ordered by seed.
 * @param divisionB Participants in division B, ordered by seed.
 * @param groupCount Number of groups to distribute into.
 */
export function makeAbDivisionGroups<T>(
	divisionA: T[],
	divisionB: T[],
	groupCount: number,
): { a: T[]; b: T[] }[] {
	if (groupCount <= 0) throw Error("Group count must be strictly positive.");

	if (divisionA.length !== divisionB.length) {
		if (groupCount !== 1)
			throw Error(
				"Uneven A/B divisions are only supported with a single group.",
			);

		return [{ a: divisionA, b: divisionB }];
	}

	if (divisionA.length % groupCount !== 0)
		throw Error("Pool size must be divisible by group count.");

	const aOrdered = ordering["groups.seed_optimized"](divisionA, groupCount);
	const bOrdered = ordering["groups.seed_optimized"](divisionB, groupCount);

	const perPoolGroupSize = divisionA.length / groupCount;
	const groups: { a: T[]; b: T[] }[] = [];

	for (let i = 0; i < groupCount; i++) {
		groups.push({
			a: aOrdered.slice(i * perPoolGroupSize, (i + 1) * perPoolGroupSize),
			b: bOrdered.slice(i * perPoolGroupSize, (i + 1) * perPoolGroupSize),
		});
	}

	return groups;
}

/**
 * Distributes elements in groups of equal size.
 *
 * @param elements A list of elements to distribute in groups.
 * @param groupCount The group count.
 */
export function makeGroups<T>(elements: T[], groupCount: number): T[][] {
	const groupSize = Math.ceil(elements.length / groupCount);
	const result: T[][] = [];

	for (let i = 0; i < elements.length; i++) {
		if (i % groupSize === 0) result.push([]);

		result[result.length - 1].push(elements[i]);
	}

	return result;
}

/**
 * Makes pairs with each element and its next one.
 *
 * @example [1, 2, 3, 4] --> [[1, 2], [3, 4]]
 * @param array A list of elements.
 */
export function makePairs<T>(array: T[]): [T, T][] {
	return array
		.map((_, i) => (i % 2 === 0 ? [array[i], array[i + 1]] : []))
		.filter((v): v is [T, T] => v.length === 2);
}

/**
 * Ensures there are no duplicates in a list of elements.
 *
 * @param array A list of elements.
 */
export function ensureNoDuplicates<T>(array: (T | null)[]): void {
	const nonNull = getNonNull(array);
	const unique = nonNull.filter((item, index) => {
		const stringifiedItem = JSON.stringify(item);
		return (
			nonNull.findIndex((obj) => JSON.stringify(obj) === stringifiedItem) ===
			index
		);
	});

	if (unique.length < nonNull.length)
		throw new Error("The seeding has a duplicate participant.");
}

/**
 * Ensures that the participant count is valid.
 *
 * @param stageType Type of the stage to test.
 * @param participantCount The number to test.
 */
export function ensureValidSize(
	stageType: StageType,
	participantCount: number,
): void {
	if (participantCount < 2)
		throw Error("Impossible to create a stage with less than 2 participants.");

	if (stageType === "round_robin") {
		// Round robin supports any number of participants.
		return;
	}

	if (!Number.isInteger(Math.log2(participantCount)))
		throw Error(
			"The library only supports a participant count which is a power of two.",
		);
}

/**
 * Converts a participant slot to a result stored in storage, with the position the participant is coming from.
 *
 * @param slot A participant slot.
 */
export function toResultWithPosition(slot: ParticipantSlot): ParticipantSlot {
	return (
		slot && {
			id: slot.id,
			position: slot.position,
		}
	);
}

/**
 * Returns the pre-computed winner for a match because of BYEs.
 *
 * @param opponents Two opponents.
 */
export function byeWinner(opponents: Duel): ParticipantSlot {
	if (opponents[0] === null && opponents[1] === null)
		// Double BYE.
		return null; // BYE.

	if (opponents[0] === null && opponents[1] !== null)
		// opponent1 BYE.
		return { id: opponents[1].id }; // opponent2.

	if (opponents[0] !== null && opponents[1] === null)
		// opponent2 BYE.
		return { id: opponents[0].id }; // opponent1.

	return { id: null }; // Normal.
}

/**
 * Returns the pre-computed winner for a match because of BYEs in a lower bracket.
 *
 * @param opponents Two opponents.
 */
export function byeWinnerToGrandFinal(opponents: Duel): ParticipantSlot {
	const winner = byeWinner(opponents);
	if (winner) winner.position = 1;
	return winner;
}

/**
 * Returns the pre-computed loser for a match because of BYEs.
 *
 * Only used for loser bracket.
 *
 * @param opponents Two opponents.
 * @param index The index of the duel in the round.
 */
export function byeLoser(opponents: Duel, index: number): ParticipantSlot {
	if (opponents[0] === null || opponents[1] === null)
		// At least one BYE.
		return null; // BYE.

	return { id: null, position: index + 1 }; // Normal.
}

/**
 * Makes the transition to a major round for duels of the previous round. The duel count is divided by 2.
 *
 * @param previousDuels The previous duels to transition from.
 */
export function transitionToMajor(previousDuels: Duel[]): Duel[] {
	const currentDuelCount = previousDuels.length / 2;
	const currentDuels: Duel[] = [];

	for (let duelIndex = 0; duelIndex < currentDuelCount; duelIndex++) {
		const prevDuelId = duelIndex * 2;
		currentDuels.push([
			byeWinner(previousDuels[prevDuelId]),
			byeWinner(previousDuels[prevDuelId + 1]),
		]);
	}

	return currentDuels;
}

/**
 * Makes the transition to a minor round for duels of the previous round. The duel count stays the same.
 *
 * @param previousDuels The previous duels to transition from.
 * @param losers Losers from the previous major round.
 * @param method The ordering method for the losers.
 */
export function transitionToMinor(
	previousDuels: Duel[],
	losers: ParticipantSlot[],
	method?: SeedOrdering,
): Duel[] {
	const orderedLosers = method ? ordering[method](losers) : losers;
	const currentDuelCount = previousDuels.length;
	const currentDuels: Duel[] = [];

	for (let duelIndex = 0; duelIndex < currentDuelCount; duelIndex++) {
		const prevDuelId = duelIndex;
		currentDuels.push([
			orderedLosers[prevDuelId],
			byeWinner(previousDuels[prevDuelId]),
		]);
	}

	return currentDuels;
}

/**
 * Returns the number of rounds an upper bracket has given the number of participants in the stage.
 *
 * @param participantCount The number of participants in the stage.
 */
export function getUpperBracketRoundCount(participantCount: number): number {
	return Math.log2(participantCount);
}

/**
 * Returns the count of round pairs (major & minor) in a loser bracket.
 *
 * @param participantCount The number of participants in the stage.
 */
export function getRoundPairCount(participantCount: number): number {
	return getUpperBracketRoundCount(participantCount) - 1;
}

/**
 * Determines whether a double elimination stage is really necessary.
 *
 * If the size is only two (less is impossible), then a lower bracket and a grand final are not necessary.
 *
 * @param participantCount The number of participants in the stage.
 */
export function isDoubleEliminationNecessary(
	participantCount: number,
): boolean {
	return participantCount > 2;
}

/**
 * Returns only the non null elements.
 *
 * @param array The array to process.
 */
function getNonNull<T>(array: (T | null)[]): T[] {
	// Use a TS type guard to exclude null from the resulting type.
	const nonNull = array.filter((element): element is T => element !== null);
	return nonNull;
}
