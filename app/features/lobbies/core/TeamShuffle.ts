/**
 * Splits the players in a lobby's room into two teams of four for the next set.
 *
 * How it works:
 *
 * 1. If the room has more than 8 players, some sit the set out (see {@link pickSitOuts}).
 * 2. Every possible 4v4 split of the remaining 8 is tried (there are only 35) and scored with a cost, the
 *    sum of the weighted cost terms below. The cheapest split wins, ties are broken randomly.
 *
 * Cost terms, in priority order:
 *
 * 1. {@link balanceCost}: how far the predicted win probability is from 50%, from the lobby-local ratings
 * 2. {@link teammateRepeatCost}: playing with the same teammates again, especially those of the previous set
 * 3. {@link roleStackCost}: stacking players of the same role (Tacticooler, backline) on one team
 *
 * To add a cost term: write a function of the shape `(split, context) => number` where a lower number is
 * better, export a weight constant for it next to the others and add it to {@link splitCost}. Add a
 * `test.each` row to `TeamShuffle.test.ts` showing the split it should prefer.
 */

import type { Rating } from "openskill";
import * as R from "remeda";
import { PLAYERS_PER_SET, PLAYERS_PER_TEAM } from "../lobbies-constants";
import * as LobbyRating from "./LobbyRating";
import type { PlayerRole } from "./PlayerRoles";

/** Weight of {@link balanceCost}. Highest priority: a 10 percentage point imbalance costs 10. */
export const BALANCE_WEIGHT = 100;

/** Weight of {@link teammateRepeatCost}, per set two teammates have already played together. */
export const TEAMMATE_REPEAT_WEIGHT = 1;

/** Extra weight on top of {@link TEAMMATE_REPEAT_WEIGHT} for teammates who were teammates in the previous set. */
export const PREVIOUS_SET_TEAMMATE_WEIGHT = 2;

/** Weight of {@link roleStackCost}, per player of a role more than evenly spread. */
export const ROLE_STACK_WEIGHT = 0.5;

/** Costs closer than this count as a tie, picked between randomly. */
const TIE_EPSILON = 0.000_001;

export interface ShufflePlayer {
	userId: number;
	/** Lobby-local rating, see `LobbyRating` */
	rating: Rating;
	roles: PlayerRole[];
	/** How many sets of this lobby the player has sat out */
	sitOutCount: number;
	satOutPreviousSet: boolean;
}

/** Who has been whose teammate in this lobby. */
export interface TeammateHistory {
	/** Sets played together on the same team, keyed by {@link pairKey} */
	setsTogether: Map<string, number>;
	/** Pairs ({@link pairKey}) that were on the same team in the room's previous set */
	previousSetPairs: Set<string>;
}

export interface Split {
	alpha: ShufflePlayer[];
	bravo: ShufflePlayer[];
}

export interface ShuffleResult {
	alpha: number[];
	bravo: number[];
	sittingOut: number[];
}

/**
 * Picks who sits out and splits the rest into two teams with the lowest cost. `random` is injectable for tests.
 */
export function shuffle({
	players,
	history,
	random = Math.random,
}: {
	players: ShufflePlayer[];
	history: TeammateHistory;
	random?: () => number;
}): ShuffleResult {
	const sittingOut = pickSitOuts(players, random);
	const playing = players.filter(
		(player) => !sittingOut.includes(player.userId),
	);

	const scored = allSplits(playing).map((split) => ({
		split,
		cost: splitCost(split, history),
	}));
	const cheapest = Math.min(...scored.map(({ cost }) => cost));
	const candidates = scored.filter(({ cost }) => cost - cheapest < TIE_EPSILON);
	const picked = candidates[Math.floor(random() * candidates.length)].split;

	return {
		alpha: picked.alpha.map((player) => player.userId),
		bravo: picked.bravo.map((player) => player.userId),
		sittingOut,
	};
}

/**
 * Who sits out when there are more than 8 players: those who have sat out the fewest times, ties broken by
 * not making anyone sit out twice in a row, then randomly.
 */
export function pickSitOuts(
	players: ShufflePlayer[],
	random: () => number = Math.random,
): number[] {
	const count = players.length - PLAYERS_PER_SET;
	if (count <= 0) return [];

	const withTieBreaker = players.map((player) => ({
		player,
		tieBreaker: random(),
	}));

	return R.sortBy(
		withTieBreaker,
		[({ player }) => player.sitOutCount, "asc"],
		[({ player }) => (player.satOutPreviousSet ? 1 : 0), "asc"],
		[({ tieBreaker }) => tieBreaker, "asc"],
	)
		.slice(0, count)
		.map(({ player }) => player.userId);
}

/** Total weighted cost of a split, lower is better. */
export function splitCost(split: Split, history: TeammateHistory) {
	return (
		BALANCE_WEIGHT * balanceCost(split) +
		teammateRepeatCost(split, history) +
		ROLE_STACK_WEIGHT * roleStackCost(split)
	);
}

/** Distance (0-0.5) of alpha's predicted win probability from an even 50%. */
export function balanceCost(split: Split) {
	return Math.abs(
		LobbyRating.winProbability(
			split.alpha.map((player) => player.rating),
			split.bravo.map((player) => player.rating),
		) - 0.5,
	);
}

/**
 * Teammate pairs of the split that have played together before: {@link TEAMMATE_REPEAT_WEIGHT} per earlier set
 * together plus {@link PREVIOUS_SET_TEAMMATE_WEIGHT} if they were teammates in the previous set.
 */
export function teammateRepeatCost(split: Split, history: TeammateHistory) {
	let cost = 0;

	for (const team of [split.alpha, split.bravo]) {
		for (const [i, player] of team.entries()) {
			for (const teammate of team.slice(i + 1)) {
				const key = pairKey(player.userId, teammate.userId);

				cost += TEAMMATE_REPEAT_WEIGHT * (history.setsTogether.get(key) ?? 0);
				if (history.previousSetPairs.has(key)) {
					cost += PREVIOUS_SET_TEAMMATE_WEIGHT;
				}
			}
		}
	}

	return cost;
}

/** Per role, how many players more than an even spread one team has (an odd count can't be even, so is free). */
export function roleStackCost(split: Split) {
	const roles: PlayerRole[] = ["TACTICOOLER", "BACKLINE"];
	const countOf = (team: ShufflePlayer[], role: PlayerRole) =>
		team.filter((player) => player.roles.includes(role)).length;

	let cost = 0;
	for (const role of roles) {
		const alpha = countOf(split.alpha, role);
		const bravo = countOf(split.bravo, role);

		cost += Math.abs(alpha - bravo) - ((alpha + bravo) % 2);
	}

	return cost;
}

/** Order independent key of two users, for {@link TeammateHistory}. */
export function pairKey(userIdA: number, userIdB: number) {
	return userIdA < userIdB ? `${userIdA}-${userIdB}` : `${userIdB}-${userIdA}`;
}

/** Builds the teammate history from the teams of earlier sets, oldest first. */
export function teammateHistory(
	sets: Array<{ alpha: number[]; bravo: number[] }>,
): TeammateHistory {
	const setsTogether = new Map<string, number>();
	let previousSetPairs = new Set<string>();

	for (const set of sets) {
		const pairs = new Set<string>();
		for (const team of [set.alpha, set.bravo]) {
			for (const [i, userId] of team.entries()) {
				for (const teammateId of team.slice(i + 1)) {
					pairs.add(pairKey(userId, teammateId));
				}
			}
		}

		for (const key of pairs) {
			setsTogether.set(key, (setsTogether.get(key) ?? 0) + 1);
		}
		previousSetPairs = pairs;
	}

	return { setsTogether, previousSetPairs };
}

/** Every way to split 8 players into two teams of 4, the first player always on alpha so mirrors aren't repeated. */
function allSplits(players: ShufflePlayer[]): Split[] {
	const [first, ...rest] = players;
	const result: Split[] = [];

	const choose = (startIdx: number, picked: ShufflePlayer[]) => {
		if (picked.length === PLAYERS_PER_TEAM - 1) {
			const alpha = [first, ...picked];
			result.push({
				alpha,
				bravo: players.filter((player) => !alpha.includes(player)),
			});
			return;
		}

		for (let i = startIdx; i < rest.length; i++) {
			choose(i + 1, [...picked, rest[i]]);
		}
	};

	choose(0, []);

	return result;
}
