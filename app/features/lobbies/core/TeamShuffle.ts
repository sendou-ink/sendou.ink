/**
 * Splits the players in a lobby's room into two teams of four for the next set.
 *
 * What it balances with:
 *
 * - {@link ratings}: lobby-local skill ratings rebuilt from the lobby's finished sets
 * - {@link rolesFromWeaponPool}: role tags of a player (Tacticooler, backline) from their match profile weapon pool
 * - {@link teammateHistory}: who has been whose teammate in the lobby
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
 * 2. {@link backlineCoverageCost}: a team with nobody who has a backline weapon in their pool
 * 3. {@link roleStackCost} of `BACKLINE`: stacking players who mostly play backline on one team
 * 4. {@link teammateRepeatCost}: playing with the same teammates again, especially those of the previous set
 * 5. {@link roleStackCost} of `TACTICOOLER`: stacking Tacticooler players on one team
 *
 * To add a cost term: write a function of the shape `(split, context) => number` where a lower number is
 * better, export a weight constant for it next to the others and add it to {@link splitCost}. Add a
 * `test.each` row to `TeamShuffle.test.ts` showing the split it should prefer.
 */

import { predictWin, type Rating, rating } from "openskill";
import * as R from "remeda";
import { hasTacticooler } from "~/features/img-export/core/RunComps";
import { rate } from "~/features/mmr/mmr-utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	type LobbySide,
	PLAYERS_PER_SET,
	PLAYERS_PER_TEAM,
} from "../lobbies-constants";
import * as LobbySet from "./LobbySet";
import * as WeaponRoll from "./WeaponRoll";

/**
 * Weight of {@link balanceCost}. Highest priority: a 10 percentage point imbalance costs 10.
 * @internal
 */
export const BALANCE_WEIGHT = 100;

/**
 * Weight of {@link backlineCoverageCost}, per team without a backline. Beats a repeated teammate pair.
 * @internal
 */
export const BACKLINE_COVERAGE_WEIGHT = 5;

/**
 * Weight of {@link roleStackCost} of `BACKLINE`. Two on one team cost as much as a team without a backline.
 * @internal
 */
export const BACKLINE_STACK_WEIGHT = 2.5;

/**
 * Weight of {@link teammateRepeatCost}, per set two teammates have already played together.
 * @internal
 */
export const TEAMMATE_REPEAT_WEIGHT = 1;

/**
 * Extra weight on top of {@link TEAMMATE_REPEAT_WEIGHT} for teammates who were teammates in the previous set.
 * @internal
 */
export const PREVIOUS_SET_TEAMMATE_WEIGHT = 2;

/**
 * Weight of {@link roleStackCost} of `TACTICOOLER`.
 * @internal
 */
export const TACTICOOLER_STACK_WEIGHT = 0.5;

/** Costs closer than this count as a tie, picked between randomly. */
const TIE_EPSILON = 0.000_001;

/**
 * Roles spread evenly across the teams, see {@link rolesFromWeaponPool}. `TACTICOOLER` and `BACKLINE` make a team lopsided when
 * stacked on one side, `BACKLINE_IN_POOL` players can fill the backline so each team should get one.
 */
export type PlayerRole = "TACTICOOLER" | "BACKLINE" | "BACKLINE_IN_POOL";

/** Share of the weapon pool needing the trait for the player to be tagged, "mostly" = more than half */
const ROLE_POOL_SHARE_THRESHOLD = 0.5;

export interface ShufflePlayer {
	userId: number;
	/** Lobby-local rating, see {@link ratings} */
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

/** A candidate split of the players into two teams, scored by {@link splitCost}. */
interface Split {
	alpha: ShufflePlayer[];
	bravo: ShufflePlayer[];
}

/** User ids of the teams of the next set and of who sits it out. */
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
 * @internal
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

/**
 * Total weighted cost of a split, lower is better.
 * @internal
 */
export function splitCost(split: Split, history: TeammateHistory) {
	return (
		BALANCE_WEIGHT * balanceCost(split) +
		BACKLINE_COVERAGE_WEIGHT * backlineCoverageCost(split) +
		BACKLINE_STACK_WEIGHT * roleStackCost(split, "BACKLINE") +
		teammateRepeatCost(split, history) +
		TACTICOOLER_STACK_WEIGHT * roleStackCost(split, "TACTICOOLER")
	);
}

/**
 * Distance (0-0.5) of alpha's predicted win probability from an even 50%.
 * @internal
 */
export function balanceCost(split: Split) {
	return Math.abs(
		winProbability(
			split.alpha.map((player) => player.rating),
			split.bravo.map((player) => player.rating),
		) - 0.5,
	);
}

/**
 * Teams (0-2) without a player who has a backline weapon in their pool. When the room doesn't have one for both
 * teams every split costs the same, so this only steers splits where both teams can have one.
 * @internal
 */
export function backlineCoverageCost(split: Split) {
	return [split.alpha, split.bravo].filter(
		(team) => !team.some((player) => player.roles.includes("BACKLINE_IN_POOL")),
	).length;
}

/**
 * Teammate pairs of the split that have played together before: {@link TEAMMATE_REPEAT_WEIGHT} per earlier set
 * together plus {@link PREVIOUS_SET_TEAMMATE_WEIGHT} if they were teammates in the previous set.
 * @internal
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

/**
 * How many players of the role one team has more than an even spread (an odd count can't be even, so is free).
 * @internal
 */
export function roleStackCost(split: Split, role: PlayerRole) {
	const countOf = (team: ShufflePlayer[]) =>
		team.filter((player) => player.roles.includes(role)).length;

	const alpha = countOf(split.alpha);
	const bravo = countOf(split.bravo);

	return Math.abs(alpha - bravo) - ((alpha + bravo) % 2);
}

/**
 * Order independent key of two users, for {@link TeammateHistory}.
 * @internal
 */
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

/**
 * Lobby-local openskill ratings computed from the lobby's game history. Everyone starts at the default rating
 * and only finished (confirmed or forfeited) sets count, so nothing needs fixing when a set is voided or a
 * player leaves. Each played map is one rating update and winning the set is one more on top: winning 2–1
 * counts as 3 wins and 1 loss. A forfeited set rates the maps actually played plus the set win of the side
 * that didn't forfeit. Never touches the global SendouQ ratings.
 */
export function ratings(sets: LobbySet.SetLike[]): Map<number, Rating> {
	const result = new Map<number, Rating>();
	const currentRating = (userId: number) => result.get(userId) ?? rating();

	const update = (winners: number[], losers: number[]) => {
		if (winners.length === 0 || losers.length === 0) return;

		const [newWinnerRatings, newLoserRatings] = rate([
			winners.map(currentRating),
			losers.map(currentRating),
		]);

		for (const [i, userId] of winners.entries()) {
			result.set(userId, newWinnerRatings[i]);
		}
		for (const [i, userId] of losers.entries()) {
			result.set(userId, newLoserRatings[i]);
		}
	};

	for (const set of sets) {
		if (!LobbySet.isFinished(set)) continue;

		const players = (side: LobbySide) => LobbySet.playersOf(set, side);

		for (const game of set.games) {
			if (!game.winnerSide) continue;

			update(
				players(game.winnerSide),
				players(LobbySet.otherSide(game.winnerSide)),
			);
		}

		const setWinner = LobbySet.winnerSide(set);
		if (setWinner) {
			update(players(setWinner), players(LobbySet.otherSide(setWinner)));
		}
	}

	return result;
}

/** Rating of the user, the default one for someone who hasn't played a rated set yet. */
export function ratingOf(ratingsByUserId: Map<number, Rating>, userId: number) {
	return ratingsByUserId.get(userId) ?? rating();
}

/**
 * Role tags of a player derived from their match profile weapon pool: `TACTICOOLER` if the pool is mostly
 * Tacticooler kits, `BACKLINE` if mostly backline weapons (see `WeaponRoll.tierOf`) and `BACKLINE_IN_POOL` if it has any.
 * An empty pool has no roles.
 */
export function rolesFromWeaponPool(weaponPool: MainWeaponId[]): PlayerRole[] {
	if (weaponPool.length === 0) return [];

	const roles: PlayerRole[] = [];

	if (isMostly(weaponPool, hasTacticooler)) roles.push("TACTICOOLER");
	if (isMostly(weaponPool, isBackline)) roles.push("BACKLINE");
	if (weaponPool.some(isBackline)) roles.push("BACKLINE_IN_POOL");

	return roles;
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

/** Predicted probability (0-1) of the alpha team beating the bravo team. */
function winProbability(alpha: Rating[], bravo: Rating[]) {
	return predictWin([alpha, bravo])[0];
}

function isMostly(
	weaponPool: MainWeaponId[],
	predicate: (weaponSplId: MainWeaponId) => boolean,
) {
	return (
		weaponPool.filter(predicate).length / weaponPool.length >
		ROLE_POOL_SHARE_THRESHOLD
	);
}

function isBackline(weaponSplId: MainWeaponId) {
	return WeaponRoll.tierOf(weaponSplId) === "BACKLINE";
}
