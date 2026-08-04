import { describe, expect, it } from "vitest";
import { assertRoundTrips } from "~/modules/search-params/search-params-test-utils";
import { chatUsersSearchParams } from "./chat-search-params";

describe("chatUsersSearchParams", () => {
	it("round-trips", () => {
		assertRoundTrips(chatUsersSearchParams, {
			ids: [[], [1], [1, 2, 3]],
		});
	});

	it("accepts the legacy comma-joined form", () => {
		const { ids } = chatUsersSearchParams.parse(
			new URL("http://localhost/api/chat-users?ids=1,2,3"),
		);
		expect(ids).toEqual([1, 2, 3]);
	});

	it("drops invalid members instead of the whole array", () => {
		const { ids } = chatUsersSearchParams.parse(
			new URL("http://localhost/api/chat-users?ids=1&ids=abc&ids=-5&ids=3"),
		);
		expect(ids).toEqual([1, 3]);
	});
});
