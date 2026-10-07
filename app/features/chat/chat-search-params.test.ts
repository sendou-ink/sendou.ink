import { describe, test } from "vitest";
import {
	assertDecodesToDefault,
	assertRoundTrips,
} from "~/modules/search-params/search-params-test-utils";
import { chatSearchParams } from "./chat-search-params";

describe("chatSearchParams", () => {
	test("round-trips", () => {
		assertRoundTrips(chatSearchParams, { chat: [null, 1, 1234] });
	});

	test("malformed values decode to defaults", () => {
		assertDecodesToDefault(chatSearchParams, "chat", [["0"], ["-3"], ["abc"]]);
	});
});
