import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import * as PlanEncoding from "./core/PlanEncoding";
import {
	autosavedPlanPersisted,
	importedPlansPersisted,
} from "./plans-persisted";
import { typicalPlan } from "./tests/fixtures";

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

describe("autosavedPlanPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(autosavedPlanPersisted, [
			null,
			PlanEncoding.encode(typicalPlan()),
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(autosavedPlanPersisted, ["1", "[]"]);
	});
});
