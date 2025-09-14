import { modesShort } from '$lib/constants/in-game/modes';
import { stageIds } from '$lib/constants/in-game/stage-ids';
import type { StageId } from '$lib/constants/in-game/types';
import type * as MapPool from '$lib/core/maps/MapPool';
import invariant from '$lib/utils/invariant';

export function mapPoolToSerializedString(mapPool: MapPool.MapPool): string {
	const serializedModes = [];

	for (const mode of modesShort) {
		const stages = mapPool[mode];
		if (stages.length === 0) continue;

		serializedModes.push(`${mode}:${binaryToHex(stageIdsToBinary(stages))}`);
	}

	return serializedModes.join(';').toLowerCase();
}

function stageIdsToBinary(input: readonly StageId[]) {
	let result = '1';

	for (const stageId of stageIds) {
		if (input.includes(stageId)) {
			result += '1';
		} else {
			result += '0';
		}
	}

	return result;
}

function binaryToHex(binary: string) {
	return Number.parseInt(binary, 2).toString(16);
}

export function serializedStringToMapPool(serialized: string): MapPool.MapPool {
	const result: MapPool.MapPool = {
		SZ: [],
		CB: [],
		RM: [],
		TC: [],
		TW: []
	};

	for (const serializedMode of serialized.split(';')) {
		const [mode, mapsInHex] = serializedMode.split(':');
		if (!mode || !mapsInHex) continue;

		const validatedMode = modesShort.find((realMode) => realMode === mode.toUpperCase());
		if (!validatedMode) continue;

		const stagesBinary = hexToBinary(mapsInHex);
		result[validatedMode].push(...binaryToStageIds(stagesBinary));
	}

	return result;
}

function binaryToStageIds(binary: string): readonly StageId[] {
	const result: StageId[] = [];

	// first 1 is padding
	for (let i = 1; i <= stageIds.length; i++) {
		const letter = binary[i];
		if (letter === '0' || !letter) continue;

		const stage = stageIds[i - 1];
		invariant(typeof stage === 'number');

		result.push(stage);
	}

	return result;
}

function hexToBinary(hex: string) {
	return Number.parseInt(hex, 16).toString(2);
}
