import { modesShort } from '$lib/constants/in-game/modes';
import type { ModeShort, StageId } from '$lib/constants/in-game/types';
import type { UserMapModePreferences } from '$lib/server/db/tables';

export type MapPool = Record<ModeShort, Array<StageId>>;

export function fromSendouQMapPoolPreferences(preferences: UserMapModePreferences) {
	const result: Partial<MapPool> = {};

	for (const mode of modesShort) {
		const pref = preferences.pool.find((pref) => pref.mode === mode);
		const prefersTheMode = preferences.modes.some(
			(pref) => pref.mode === mode && pref.preference === 'PREFER'
		);

		if (!pref || !prefersTheMode) {
			result[mode] = [];
		} else {
			result[mode] = pref.stages;
		}
	}

	return result as MapPool;
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
