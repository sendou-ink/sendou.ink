import type { Duel, ParticipantSlot, SeedOrdering, StageType } from "../types";
import { ordering } from "./seeding";

/** Rounds of matches for a round-robin group. */
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
 * Rounds of matches for a bipartite (A/B divisions) round-robin group: every A team plays every
 * B team exactly once. Round 1 is cross-seeded (strongest A vs weakest B), B rotates downward each
 * round. Uneven divisions are padded with byes that are filtered out, so each round has
 * `min(|A|, |B|)` matches and the total is `|A| * |B|`. Both divisions ordered by seed.
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
 * Distributes A/B division participants (ordered by seed) into groups with an equal number of A
 * and B in each. `groups.seed_optimized` snake ordering is applied to each division independently.
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

/** Distributes elements in groups of equal size. */
export function makeGroups<T>(elements: T[], groupCount: number): T[][] {
	const groupSize = Math.ceil(elements.length / groupCount);
	const result: T[][] = [];

	for (let i = 0; i < elements.length; i++) {
		if (i % groupSize === 0) result.push([]);

		result[result.length - 1].push(elements[i]);
	}

	return result;
}

/** [1, 2, 3, 4] --> [[1, 2], [3, 4]] */
export function makePairs<T>(array: T[]): [T, T][] {
	return array
		.map((_, i) => (i % 2 === 0 ? [array[i], array[i + 1]] : []))
		.filter((v): v is [T, T] => v.length === 2);
}

/** Throws if the seeding has a duplicate participant. */
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

/** Throws if the participant count is invalid for the stage type. */
export function ensureValidSize(
	stageType: StageType,
	participantCount: number,
): void {
	if (participantCount < 2)
		throw Error("Impossible to create a stage with less than 2 participants.");

	if (stageType === "round_robin") {
		return;
	}

	if (!Number.isInteger(Math.log2(participantCount)))
		throw Error(
			"The library only supports a participant count which is a power of two.",
		);
}

/** Participant slot as a stored result, with the position the participant is coming from. */
export function toResultWithPosition(slot: ParticipantSlot): ParticipantSlot {
	return (
		slot && {
			id: slot.id,
			position: slot.position,
		}
	);
}

/** Pre-computed winner of a match because of BYEs. */
export function byeWinner(opponents: Duel): ParticipantSlot {
	if (opponents[0] === null && opponents[1] === null)
		// Double BYE.
		return null;

	if (opponents[0] === null && opponents[1] !== null)
		return { id: opponents[1].id };

	if (opponents[0] !== null && opponents[1] === null)
		return { id: opponents[0].id };

	return { id: null };
}

/** Pre-computed winner of a lower bracket match because of BYEs. */
export function byeWinnerToGrandFinal(opponents: Duel): ParticipantSlot {
	const winner = byeWinner(opponents);
	if (winner) winner.position = 1;
	return winner;
}

/** Pre-computed loser of a match because of BYEs. Only used for loser bracket. */
export function byeLoser(opponents: Duel, index: number): ParticipantSlot {
	if (opponents[0] === null || opponents[1] === null)
		// At least one BYE.
		return null;

	return { id: null, position: index + 1 };
}

/** Transition to a major round: the duel count is halved. */
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

/** Transition to a minor round: the duel count stays the same, losers of the previous major round join. */
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

/** Number of rounds in an upper bracket. */
export function getUpperBracketRoundCount(participantCount: number): number {
	return Math.log2(participantCount);
}

/** Count of round pairs (major & minor) in a loser bracket. */
export function getRoundPairCount(participantCount: number): number {
	return getUpperBracketRoundCount(participantCount) - 1;
}

/** With only two participants a lower bracket and a grand final are not necessary. */
export function isDoubleEliminationNecessary(
	participantCount: number,
): boolean {
	return participantCount > 2;
}

function getNonNull<T>(array: (T | null)[]): T[] {
	const nonNull = array.filter((element): element is T => element !== null);
	return nonNull;
}
