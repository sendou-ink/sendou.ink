import type { ModeShort, StageId } from '$lib/constants/in-game/types';
import type { UserMapModePreferences } from '$lib/server/db/tables';

export type MapPool = Record<ModeShort, Array<StageId>>;

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

export function isEmpty(pool: Partial<MapPool>): boolean {
	return Object.values(pool).every((stageIds) => stageIds.length === 0);
}

export function toArray(pool: Partial<MapPool>) {
	return Object.entries(pool).flatMap(([mode, stageIds]) =>
		stageIds.map((stageId) => ({ mode: mode as ModeShort, stageId }))
	);
}

export function fromArray(array: Array<{ mode: ModeShort; stageId: StageId }>): MapPool {
	return array.reduce((acc, { mode, stageId }) => {
		acc[mode] = acc[mode] ?? [];
		acc[mode].push(stageId);
		acc[mode].sort((a, b) => a - b);
		return acc;
	}, empty());
}
