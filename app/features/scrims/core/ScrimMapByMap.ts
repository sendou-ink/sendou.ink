// xxx: probably just merge with Scrim

import type { Tables } from "~/db/tables";
import * as MapList from "~/features/map-list-generator/core/MapList";
import {
	type DbMapPoolList,
	MapPool,
} from "~/features/map-list-generator/core/map-pool";
import type { MapPoolObject } from "~/features/map-list-generator/core/map-pool-serializer/types";
import { modesShort } from "~/modules/in-game-lists/modes";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";

type ScrimMapListRow = Pick<
	Tables["ScrimMapList"],
	"side" | "source" | "tournamentId" | "serializedPool"
>;

type ScrimMapRow = Pick<
	Tables["ScrimMap"],
	"index" | "mode" | "stageId" | "winnerSide" | "reportedAt"
>;

/**
 * Merges the submitted map lists into a single deduplicated MapPool. Tournament
 * pools are resolved by the caller and passed in via `tournamentPools` keyed by
 * the tournament id.
 */
export function unionPool(
	lists: ScrimMapListRow[],
	tournamentPools: Map<number, DbMapPoolList> = new Map(),
): MapPool {
	const merged: MapPoolObject = {
		TW: [],
		SZ: [],
		TC: [],
		RM: [],
		CB: [],
	};

	const addPair = (mode: ModeShort, stageId: StageId) => {
		if (!merged[mode].includes(stageId)) merged[mode].push(stageId);
	};

	for (const list of lists) {
		if (list.source === "TOURNAMENT") {
			const tournamentList = list.tournamentId
				? tournamentPools.get(list.tournamentId)
				: undefined;
			if (!tournamentList) continue;
			for (const { mode, stageId } of tournamentList) {
				addPair(mode, stageId);
			}
		} else {
			if (!list.serializedPool) continue;
			const pool = new MapPool(list.serializedPool);
			for (const { mode, stageId } of pool.stageModePairs) {
				addPair(mode, stageId);
			}
		}
	}

	return new MapPool(merged);
}

/**
 * Generates the next single map for the scrim by replaying the past map history
 * through the underlying generator so the resulting map respects its
 * anti-repeat and mode-ordering behavior.
 */
export function generateNextMap(args: {
	pool: MapPool;
	history: Pick<Tables["ScrimMap"], "mode" | "stageId">[];
}): { mode: ModeShort; stageId: StageId } {
	if (args.pool.isEmpty()) {
		throw new Error("Cannot generate map from empty pool");
	}

	const initialWeights = new Map<string, number>();
	if (args.history.length > 0) {
		for (const pair of args.pool.stageModePairs) {
			initialWeights.set(MapList.modeStageKey(pair.mode, pair.stageId), 0);
		}
		for (const played of args.history) {
			initialWeights.set(
				MapList.modeStageKey(played.mode, played.stageId),
				-1000, // xxx: why -1000?
			);
		}
	}

	const generator = MapList.generate({
		mapPool: args.pool,
		initialWeights: initialWeights.size > 0 ? initialWeights : undefined,
		skipEnsureMinimumCandidates: true,
	});

	generator.next();
	const result = generator.next({ amount: 1 }).value;

	if (!result || result.length === 0) {
		throw new Error("Failed to generate map");
	}

	return { mode: result[0].mode, stageId: result[0].stageId };
}

/**
 * Returns true when the given map is the most recently reported one and is
 * therefore eligible to be undone.
 */
export function canUndo(
	map: ScrimMapRow | undefined,
	history: ScrimMapRow[],
): boolean {
	if (!map || map.reportedAt === null) return false;

	for (const other of history) {
		if (other.reportedAt === null) continue;
		if (other.index > map.index) return false;
	}

	return true;
}

export type StatsRow = {
	key: string;
	wins: number;
	losses: number;
};

export type Stats = {
	byMode: StatsRow[];
	byStage: StatsRow[];
	byStageMode: StatsRow[];
};

/**
 * Aggregates per-mode, per-stage, and per-(stage, mode) win/loss counts from
 * the viewer's perspective. Maps outside `restrictToPool` (when provided) are
 * skipped, as are unreported maps. Empty rows are filtered out.
 */
export function stats(
	maps: ScrimMapRow[],
	viewerSide: "ALPHA" | "BRAVO",
	opts: { restrictToPool?: MapPool } = {},
): Stats {
	const byMode = new Map<ModeShort, StatsRow>();
	const byStage = new Map<StageId, StatsRow>();
	const byStageMode = new Map<string, StatsRow>();

	const stageModeKey = (mode: ModeShort, stageId: StageId) =>
		`${stageId}-${mode}`;

	const bump = <K>(
		bucket: Map<K, StatsRow>,
		key: K,
		display: string,
		isWin: boolean,
	) => {
		const existing = bucket.get(key);
		if (existing) {
			if (isWin) existing.wins += 1;
			else existing.losses += 1;
			return;
		}
		bucket.set(key, {
			key: display,
			wins: isWin ? 1 : 0,
			losses: isWin ? 0 : 1,
		});
	};

	for (const map of maps) {
		if (map.reportedAt === null || map.winnerSide === null) continue;
		if (
			opts.restrictToPool &&
			!opts.restrictToPool.has({ mode: map.mode, stageId: map.stageId })
		) {
			continue;
		}

		const isWin = map.winnerSide === viewerSide;

		bump(byMode, map.mode, map.mode, isWin);
		bump(byStage, map.stageId, String(map.stageId), isWin);
		bump(
			byStageMode,
			stageModeKey(map.mode, map.stageId),
			stageModeKey(map.mode, map.stageId),
			isWin,
		);
	}

	const filterEmpty = (rows: StatsRow[]) =>
		rows.filter((r) => r.wins + r.losses > 0);

	const orderedByMode: StatsRow[] = [];
	for (const mode of modesShort) {
		const row = byMode.get(mode);
		if (row) orderedByMode.push(row);
	}

	return {
		byMode: filterEmpty(orderedByMode),
		byStage: filterEmpty([...byStage.values()]),
		byStageMode: filterEmpty([...byStageMode.values()]),
	};
}
