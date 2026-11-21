import { describe, expect, test } from "vitest";
import {
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

function byName(a: string, b: string) {
	return a.localeCompare(b);
}
