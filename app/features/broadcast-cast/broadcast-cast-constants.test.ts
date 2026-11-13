import { describe, expect, test } from "vitest";
import {
	BROADCAST_SCENE_DURATIONS_MS,
	BROADCAST_SCENE_GROUPS,
	BROADCAST_SCENES,
} from "./broadcast-cast-constants";

describe("BROADCAST_SCENE_GROUPS", () => {
	test("has every scene exactly once", () => {
		const groupedScenes = BROADCAST_SCENE_GROUPS.flatMap(
			(group) => group.scenes,
		);

		expect(groupedScenes.toSorted(byName)).toEqual(
			BROADCAST_SCENES.toSorted(byName),
		);
	});
});

describe("BROADCAST_SCENE_DURATIONS_MS", () => {
	test.each(Object.entries(BROADCAST_SCENE_DURATIONS_MS))(
		"%s defaults to until a Take or one of its options",
		(_scene, durations) => {
			if (durations.defaultMs === null) return;

			expect(durations.optionsMs).toContain(durations.defaultMs);
		},
	);
});

function byName(a: string, b: string) {
	return a.localeCompare(b);
}
