import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import {
	devToolbarPersisted,
	scenarioLogInPersisted,
	scenarioParamsPersisted,
} from "./dev-tools-persisted";

describe("devToolbarPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(devToolbarPersisted, [
			{ isMinimized: false },
			{ isMinimized: true },
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(devToolbarPersisted, [
			"not json",
			'{"isOpen":true,"tab":"scenarios"}',
		]);
	});
});

describe("scenarioLogInPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(scenarioLogInPersisted, [true, false]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(scenarioLogInPersisted, ["yes", "1"]);
	});
});

describe("scenarioParamsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(scenarioParamsPersisted, [
			{},
			{ teams: 16, format: "swiss" },
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(scenarioParamsPersisted, ["[]", '{"teams":true}']);
	});
});
