import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import { importedPlansPersisted } from "./plans-persisted";

describe("importedPlansPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(importedPlansPersisted, [
			null,
			{
				background: "data:image/webp;base64,AQID",
				allies: [0, 10],
				enemies: [40],
			},
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(importedPlansPersisted, [
			"not json",
			'{"background":"x","allies":[999999],"enemies":[]}',
		]);
	});
});
