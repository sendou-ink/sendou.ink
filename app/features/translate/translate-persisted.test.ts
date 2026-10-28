import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/persisted-state/persisted-state-test-utils";
import {
	draftsPersisted,
	previewLanguagePersisted,
} from "./translate-persisted";

describe("draftsPersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(draftsPersisted, [
			{},
			{ common: { save: { value: "Speichern", source: "Save" } } },
		]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(draftsPersisted, [
			"not json",
			"[]",
			'{"common":{"save":"Speichern"}}',
		]);
	});
});

describe("previewLanguagePersisted", () => {
	test("round-trips", () => {
		assertRoundTrips(previewLanguagePersisted, [null, "de", "es-US"]);
	});

	test("malformed values decode to the default", () => {
		assertDecodesToDefault(previewLanguagePersisted, [
			"en",
			"pt-BR",
			"xx",
			"[1]",
		]);
	});
});
