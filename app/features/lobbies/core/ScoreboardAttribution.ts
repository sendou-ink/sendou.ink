/**
 * Who of a lobby's players sat on which row of a game's scanned scoreboard. A row only carries an in-game name,
 * which can differ from the one on the site or be misread, so names are learned over the whole lobby: teams
 * reshuffle after every set, and a name keeps landing on the side of the one player who plays under it.
 *
 * Reads of a name (OCR variants pooled, the scanner's `isSameNameRead`) are scored against every player: a point
 * for each game they shared a side, `ANCHOR_WEIGHT` more for each game an anchor ties them (the POV seat of a scan,
 * the only row of the side with a weapon the player reported, the player's in-game name on the site). Each side of
 * a game then takes its highest scoring row → player assignment. A row is left unattributed when another equally
 * scoring assignment gives it someone else, so a name only seen with the same teammates stays unknown, while a name
 * new mid-set (a name change) is still placed once the side's other rows are. A name whose top scorer didn't play
 * on the row's side (someone playing on another's seat or Switch) says nothing about whose seat the row is, so its
 * row is only placed that way too.
 */
import { isSameNameRead } from "~/features/scanner/core/match-sets";
import { nameSimilarity } from "~/features/scanner/core/text";
import * as Matches from "~/features/scanner-ingest/core/Matches";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { LobbySide } from "../lobbies-constants";

/** How much more than sharing a side an anchor (POV seat, reported weapon, site in-game name) counts, per game. */
const ANCHOR_WEIGHT = 2;

const SIDES = ["ALPHA", "BRAVO"] as const satisfies LobbySide[];

/** A game with a scanned scoreboard and who played it. */
export interface AttributionGame {
	rows: Array<{
		name: string;
		side: LobbySide;
		weaponSplId: MainWeaponId | null;
		/** known from the POV seat of a linked scan */
		userId?: number;
	}>;
	players: Array<{
		userId: number;
		side: LobbySide;
		/** in-game name on the site */
		inGameName: string | null;
		reportedWeaponSplId: MainWeaponId | null;
	}>;
}

/**
 * Attributes the scoreboard rows of a lobby's games to its players, see the top of the file.
 *
 * @param games every game of the lobby with a scoreboard, the more the better
 * @returns per game, the user id of each row (index-aligned with `rows`), null where it can't be told
 */
export function rowUserIds(
	games: AttributionGame[],
): Array<Array<number | null>> {
	const clusterIds = nameClusterIds(games);
	const scores = nameScores(games, clusterIds);
	const owners = clusterOwners(scores);

	return games.map((game, gameIdx) => {
		const result = game.rows.map((row) => row.userId ?? null);

		for (const side of SIDES) {
			const userIds = game.players
				.filter((player) => player.side === side)
				.map((player) => player.userId);
			const rowIdxs = game.rows.flatMap((row, rowIdx) =>
				row.side === side ? [rowIdx] : [],
			);
			const scoreOf = (i: number, userId: number) => {
				const clusterId = clusterIds[gameIdx]![rowIdxs[i]!]!;
				const owner = owners.get(clusterId);
				if (owner !== undefined && !userIds.includes(owner)) return 0;

				return scores.get(clusterId)?.get(userId) ?? 0;
			};

			const assigned = assignSide({
				forced: rowIdxs.map((rowIdx) => game.rows[rowIdx]!.userId ?? null),
				userIds,
				scoreOf,
			});

			for (const [i, userId] of assigned.entries()) {
				result[rowIdxs[i]!] ??= userId;
			}
		}

		return result;
	});
}

/** Per game per row, the id of its name's cluster: reads of one name pooled, a row without a name its own cluster. */
function nameClusterIds(games: AttributionGame[]) {
	const clusters: Set<string>[] = [];

	return games.map((game) => {
		const takenInGame = new Set<number>();

		return game.rows.map((row) => {
			const read = Matches.normalizeInGameName(row.name);
			const existingId = read
				? matchingClusterId({ clusters, read, takenInGame })
				: null;

			const clusterId = existingId ?? clusters.length;
			if (existingId === null) clusters.push(new Set());
			if (read) clusters[clusterId]!.add(read);
			takenInGame.add(clusterId);

			return clusterId;
		});
	});
}

function matchingClusterId({
	clusters,
	read,
	takenInGame,
}: {
	clusters: Set<string>[];
	read: string;
	takenInGame: Set<number>;
}) {
	const candidateIds = clusters.flatMap((_, clusterId) =>
		takenInGame.has(clusterId) ? [] : [clusterId],
	);

	const exactId = candidateIds.find((clusterId) =>
		clusters[clusterId]!.has(read),
	);
	if (exactId !== undefined) return exactId;

	let best: { clusterId: number; similarity: number } | null = null;
	for (const clusterId of candidateIds) {
		for (const clusterRead of clusters[clusterId]!) {
			if (!isSameNameRead(read, clusterRead)) continue;

			const similarity = nameSimilarity(read, clusterRead);
			if (!best || similarity > best.similarity) {
				best = { clusterId, similarity };
			}
		}
	}

	return best?.clusterId ?? null;
}

/** Per name cluster, each player's score: shared sides plus anchors, see the top of the file. */
function nameScores(games: AttributionGame[], clusterIds: number[][]) {
	const scores = new Map<number, Map<number, number>>();

	for (const [gameIdx, game] of games.entries()) {
		for (const [rowIdx, row] of game.rows.entries()) {
			const clusterId = clusterIds[gameIdx]![rowIdx]!;
			const clusterScores = scores.get(clusterId) ?? new Map<number, number>();
			scores.set(clusterId, clusterScores);

			const anchored = anchoredUserIds(game, row);
			for (const player of game.players) {
				if (player.side !== row.side) continue;

				const score = anchored.includes(player.userId) ? 1 + ANCHOR_WEIGHT : 1;
				clusterScores.set(
					player.userId,
					(clusterScores.get(player.userId) ?? 0) + score,
				);
			}
		}
	}

	return scores;
}

/** Per name cluster, its single top scorer. */
function clusterOwners(scores: Map<number, Map<number, number>>) {
	const owners = new Map<number, number>();

	for (const [clusterId, clusterScores] of scores) {
		const [top, runnerUp] = [...clusterScores].sort(([, a], [, b]) => b - a);
		if (top && (!runnerUp || top[1] > runnerUp[1])) {
			owners.set(clusterId, top[0]);
		}
	}

	return owners;
}

function anchoredUserIds(
	game: AttributionGame,
	row: AttributionGame["rows"][number],
) {
	if (row.userId !== undefined) return [row.userId];

	const sidePlayers = game.players.filter((player) => player.side === row.side);
	const read = Matches.normalizeInGameName(row.name);

	const byInGameName = read
		? sidePlayers.filter((player) => {
				const inGameName = player.inGameName
					? Matches.normalizeSiteInGameName(player.inGameName)
					: "";
				return inGameName && isSameNameRead(read, inGameName);
			})
		: [];

	const isOnlyRowWithWeapon =
		row.weaponSplId !== null &&
		game.rows.filter(
			(other) =>
				other.side === row.side && other.weaponSplId === row.weaponSplId,
		).length === 1;
	const byReportedWeapon = isOnlyRowWithWeapon
		? sidePlayers.filter(
				(player) => player.reportedWeaponSplId === row.weaponSplId,
			)
		: [];

	return [...byInGameName, ...byReportedWeapon].map((player) => player.userId);
}

/** The side's rows' users of its best assignments, null where they disagree (or the rows and players don't add up). */
function assignSide({
	forced,
	userIds,
	scoreOf,
}: {
	/** per row, the user it must get */
	forced: Array<number | null>;
	userIds: number[];
	scoreOf: (rowIdx: number, userId: number) => number;
}): Array<number | null> {
	const unknown = forced.map(() => null);
	if (forced.length !== userIds.length) return unknown;

	let bestScore = Number.NEGATIVE_INFINITY;
	let best: number[][] = [];
	for (const assignment of permutations(userIds)) {
		if (
			assignment.some(
				(userId, rowIdx) =>
					forced[rowIdx] !== null && forced[rowIdx] !== userId,
			)
		) {
			continue;
		}

		const score = assignment.reduce(
			(sum, userId, rowIdx) => sum + scoreOf(rowIdx, userId),
			0,
		);
		if (score > bestScore) {
			bestScore = score;
			best = [assignment];
		} else if (score === bestScore) {
			best.push(assignment);
		}
	}

	if (best.length === 0) return unknown;

	return forced.map((_, rowIdx) => {
		const userId = best[0]![rowIdx]!;
		return best.every((assignment) => assignment[rowIdx] === userId)
			? userId
			: null;
	});
}

function permutations(items: number[]): number[][] {
	if (items.length <= 1) return [items];

	return items.flatMap((item, i) =>
		permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
			item,
			...rest,
		]),
	);
}
