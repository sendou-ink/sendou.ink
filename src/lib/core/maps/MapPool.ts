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

export function toArray(pool: Partial<MapPool>) {
	return Object.entries(pool).flatMap(([mode, stageIds]) =>
		stageIds.map((stageId) => ({ mode: mode as ModeShort, stageId }))
	);
}
