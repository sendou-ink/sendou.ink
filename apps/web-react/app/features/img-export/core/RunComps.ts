import * as R from "remeda";
import { weaponParams } from "~/features/build-analyzer/core/utils";
import type { MainWeaponId } from "~/modules/in-game-lists/types";

const TACTICOOLER_SPECIAL_WEAPON_ID = 15;
const COMP_SIZE = 4;

export interface CompObservation {
	/** Identity of the player within the aggregated maps: user id when known, otherwise the ingested scoreboard name */
	playerKey: string;
	weaponSplId: MainWeaponId;
	/** Chronological index of the map the weapon was played in */
	mapOrder: number;
}

/**
 * Builds a team's weapon comp from per map weapon observations. Each player
 * contributes the weapon they played the most (ties broken by the most
 * recently played one). The comp is in weapon id order, except weapons with
 * Tacticooler as the special go last. When more than {@link COMP_SIZE}
 * players were observed, the ones that played the most maps make the comp.
 */
export function buildComp(observations: CompObservation[]): MainWeaponId[] {
	const byPlayer = new Map<string, CompObservation[]>();
	for (const observation of observations) {
		const playerObservations = byPlayer.get(observation.playerKey) ?? [];
		playerObservations.push(observation);
		byPlayer.set(observation.playerKey, playerObservations);
	}

	const compPlayers = R.sortBy(
		[...byPlayer.values()],
		[(playerObservations) => playerObservations.length, "desc"],
		(playerObservations) =>
			Math.min(...playerObservations.map((o) => o.mapOrder)),
	).slice(0, COMP_SIZE);

	return R.sortBy(
		compPlayers.map(mostPlayedWeapon),
		(weaponSplId) => (hasTacticooler(weaponSplId) ? 1 : 0),
		(weaponSplId) => weaponSplId,
	);
}

/**
 * Converts one map's reported and ingested weapon rows of a team into comp
 * observations. Ingested rows that duplicate a reported weapon are dropped:
 * a row linked to a user that already reported, or an unlinked row whose
 * weapon a report already accounts for (a multiset, matching how the match
 * page timeline merges the two sources).
 */
export function mapObservations({
	mapOrder,
	reported,
	ingested,
}: {
	mapOrder: number;
	reported: Array<{ userId: number; weaponSplId: MainWeaponId }>;
	ingested: Array<{
		name: string;
		userId?: number;
		weaponSplId: MainWeaponId | null;
	}>;
}): CompObservation[] {
	const reportedUserIds = new Set(reported.map((row) => row.userId));
	const accountedForCounts = new Map<MainWeaponId, number>();
	for (const row of reported) {
		accountedForCounts.set(
			row.weaponSplId,
			(accountedForCounts.get(row.weaponSplId) ?? 0) + 1,
		);
	}

	const observations: CompObservation[] = reported.map((row) => ({
		playerKey: `user-${row.userId}`,
		weaponSplId: row.weaponSplId,
		mapOrder,
	}));

	for (const row of ingested) {
		if (row.weaponSplId === null) continue;
		if (row.userId !== undefined && reportedUserIds.has(row.userId)) continue;

		if (row.userId === undefined) {
			const accountedFor = accountedForCounts.get(row.weaponSplId) ?? 0;
			if (accountedFor > 0) {
				accountedForCounts.set(row.weaponSplId, accountedFor - 1);
				continue;
			}
		}

		observations.push({
			playerKey:
				row.userId !== undefined ? `user-${row.userId}` : `name-${row.name}`,
			weaponSplId: row.weaponSplId,
			mapOrder,
		});
	}

	return observations;
}

function mostPlayedWeapon(playerObservations: CompObservation[]): MainWeaponId {
	const counts = new Map<MainWeaponId, number>();
	const lastPlayedAt = new Map<MainWeaponId, number>();
	for (const observation of playerObservations) {
		counts.set(
			observation.weaponSplId,
			(counts.get(observation.weaponSplId) ?? 0) + 1,
		);
		lastPlayedAt.set(
			observation.weaponSplId,
			Math.max(
				lastPlayedAt.get(observation.weaponSplId) ?? -1,
				observation.mapOrder,
			),
		);
	}

	return R.sortBy(
		[...counts.keys()],
		[(weaponSplId) => counts.get(weaponSplId)!, "desc"],
		[(weaponSplId) => lastPlayedAt.get(weaponSplId)!, "desc"],
	)[0];
}

function hasTacticooler(weaponSplId: MainWeaponId) {
	return (
		weaponParams().weaponKits[weaponSplId].specialWeaponId ===
		TACTICOOLER_SPECIAL_WEAPON_ID
	);
}
