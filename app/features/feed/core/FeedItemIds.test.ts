import { describe, expect, test } from "vitest";
import * as FeedItemIds from "./FeedItemIds";

describe("FeedItemIds.make", () => {
	test("is the same for the same post", () => {
		const post = {
			type: "TO_WIN",
			at: 1_700_000_000,
			actorKey: "274",
		} as const;

		expect(FeedItemIds.make(post)).toBe(FeedItemIds.make({ ...post }));
	});

	test.each([
		{ why: "time", change: { at: 1_700_000_001 } },
		{ why: "actor", change: { actorKey: "275" } },
		{ why: "type", change: { type: "TO_PODIUM" } },
	] as const)("differs by $why", ({ change }) => {
		const post = {
			type: "TO_WIN",
			at: 1_700_000_000,
			actorKey: "274",
		} as const;

		expect(FeedItemIds.make(post)).not.toBe(
			FeedItemIds.make({ ...post, ...change }),
		);
	});
});

describe("FeedItemIds.typeOf", () => {
	test("reads the type back from a made id", () => {
		expect(
			FeedItemIds.typeOf(
				FeedItemIds.make({
					type: "SQ_SEASON_START",
					at: 1_700_000_000,
					actorKey: "series-Swim or Sink",
				}),
			),
		).toBe("SQ_SEASON_START");
	});

	test.each([
		{ why: "unknown type", id: "NOT_A_TYPE-1700000000-abc" },
		{ why: "bare type", id: "TO_WIN" },
		{ why: "missing hash", id: "TO_WIN-1700000000" },
		{ why: "inherited property", id: "constructor-1700000000-abc" },
	])("null for $why", ({ id }) => {
		expect(FeedItemIds.typeOf(id)).toBeNull();
	});
});
