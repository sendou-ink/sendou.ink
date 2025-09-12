import { modesShort } from '$lib/constants/in-game/modes';
import type { ModeShort, ModeWithStage, StageId } from '$lib/constants/in-game/types';
import { mapPoolToSerializedString, serializedStringToMapPool } from '$lib/core/maps/serializer';
import type { UserMapModePreferences } from '$lib/server/db/tables';

export type MapPool = Record<ModeShort, Array<StageId>>;
export type PartialMapPool = Partial<Record<ModeShort, Array<StageId>>>;

export function fromSendouQMapPoolPreferences(pool: UserMapModePreferences['pool']) {
	return {
		...empty(),
		pool
	};
}

export function empty(): MapPool {
	return {
		TW: [],
		SZ: [],
		TC: [],
		RM: [],
		CB: []
	};
}

export function partialMapPoolToFull(pool: PartialMapPool): MapPool {
	return {
		...empty(),
		...pool
	};
}

export function isEmpty(pool: PartialMapPool): boolean {
	return Object.values(pool).every((stageIds) => stageIds.length === 0);
}

export function toArray(pool: PartialMapPool): Array<ModeWithStage> {
	return Object.entries(pool).flatMap(([mode, stageIds]) =>
		stageIds.map((stageId) => ({ mode: mode as ModeShort, stageId }))
	);
}

/** Returns an array containing modes that have at least one map in the map pool. */
export function toModes(pool: PartialMapPool) {
	const result: ModeShort[] = [];

	for (const mode of modesShort) {
		if (pool[mode] && pool[mode]!.length > 0) {
			result.push(mode);
		}
	}

	return result;
}

export function fromArray(array: Array<ModeWithStage>): MapPool {
	return array.reduce((acc, { mode, stageId }) => {
		acc[mode] = acc[mode] ?? [];
		acc[mode].push(stageId);
		acc[mode].sort((a, b) => a - b);
		return acc;
	}, empty());
}

export function toSerialized(mapPool: PartialMapPool): string {
	return mapPoolToSerializedString(partialMapPoolToFull(mapPool));
}

export function fromSerialized(serialized: string): MapPool {
	return serializedStringToMapPool(serialized);
}
