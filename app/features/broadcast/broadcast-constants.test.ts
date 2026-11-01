import { describe, expect, test } from "vitest";
import {
	BROADCAST_SCENE_GROUPS,
	BROADCAST_SCENES,
} from "./broadcast-constants";

describe("BROADCAST_SCENE_GROUPS", () => {
	test("has every scene exactly once", () => {
		const groupedScenes = BROADCAST_SCENE_GROUPS.flatMap(
			(group) => group.scenes,
		);

		expect([...groupedScenes].sort()).toEqual([...BROADCAST_SCENES].sort());
	});
});
