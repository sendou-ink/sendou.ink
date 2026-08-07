/**
 * Display-side cleanup for a match card's source event list: a long map-open
 * can fragment into several minimap events (the timeline's merge window
 * tracks a drifting `t`, and VoD results arrive out of order), so a minimap
 * that shows nothing new versus the previous one is pure noise. Names are
 * ignored in the comparison — OCR wobbles on them while the actual content
 * (stage, weapons, ability reads) is unchanged. Stored events are untouched;
 * this only filters what gets rendered.
 */

import { isDeepEqual, omit } from "remeda";
import {
	MINIMAP_EVENT_TYPE,
	type MinimapData,
} from "../core/detectors/minimap/index";

export function withoutRepeatEvents<T extends { type: string; data: unknown }>(
	events: readonly T[],
): T[] {
	const result: T[] = [];
	let previousMinimap: MinimapData | null = null;
	for (const event of events) {
		if (event.type === MINIMAP_EVENT_TYPE) {
			const data = event.data as MinimapData;
			const repeat =
				previousMinimap !== null &&
				isDeepEqual(comparable(previousMinimap), comparable(data));
			previousMinimap = data;
			if (repeat) continue;
		}
		result.push(event);
	}
	return result;
}

function comparable(data: MinimapData) {
	return {
		...data,
		teammates: data.teammates.map((player) => omit(player, ["name"])),
		enemies: data.enemies.map((player) => omit(player, ["name"])),
	};
}
