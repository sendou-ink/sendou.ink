import { describe, expect, test } from "vitest";
import * as EventVersion from "../../core/event-version";

/** v1 `Death.killer` became `name` in v2; v2 `Ping` has no v3 equivalent; v3 renamed `Death` to `Splat`. */
const SCHEMA = {
	current: 3,
	steps: {
		1: ({ type, data }: { type: string; data: unknown }) =>
			type === "Death"
				? { type, data: { name: (data as { killer: string }).killer } }
				: { type, data },
		2: ({ type, data }: { type: string; data: unknown }) => {
			if (type === "Ping") return null;
			return { type: type === "Death" ? "Splat" : type, data };
		},
	},
};

describe("EventVersion.upgradedFrom", () => {
	test.each([
		{
			why: "runs every step from the event's version on",
			version: 1,
			event: { type: "Death", data: { killer: "a" } },
			expected: { type: "Splat", data: { name: "a" } },
		},
		{
			why: "skips the steps before the event's version",
			version: 2,
			event: { type: "Death", data: { name: "a" } },
			expected: { type: "Splat", data: { name: "a" } },
		},
		{
			why: "reads an unstamped event as version 1",
			version: undefined,
			event: { type: "Death", data: { killer: "a" } },
			expected: { type: "Splat", data: { name: "a" } },
		},
		{
			why: "drops an event a step has no equivalent for",
			version: 1,
			event: { type: "Ping", data: {} },
			expected: null,
		},
		{
			why: "drops an event written by newer code",
			version: 4,
			event: { type: "Splat", data: { name: "a" } },
			expected: null,
		},
		{
			why: "drops an event older than the first step",
			version: 0,
			event: { type: "Death", data: { killer: "a" } },
			expected: null,
		},
	])("$why", ({ version, event, expected }) => {
		expect(EventVersion.upgradedFrom(version, event, SCHEMA)).toEqual(expected);
	});

	test("returns a current event as the same object", () => {
		const event = { type: "Splat", data: { name: "a" } };

		expect(EventVersion.upgradedFrom(3, event, SCHEMA)).toBe(event);
	});

	test("keeps the event's other fields", () => {
		const event = { id: 7, t: 12, type: "Death", data: { killer: "a" } };

		expect(EventVersion.upgradedFrom(1, event, SCHEMA)).toEqual({
			id: 7,
			t: 12,
			type: "Splat",
			data: { name: "a" },
		});
	});

	test("reads an unstamped event as current while no step exists", () => {
		const event = { type: "Death", data: { name: "a" } };

		expect(EventVersion.upgradedFrom(undefined, event)).toBe(event);
		expect(EventVersion.upgradedFrom(EventVersion.CURRENT, event)).toBe(event);
	});
});

describe("EventVersion.readable", () => {
	test("upgrades and restamps older records, leaving the unreadable ones out", () => {
		const current = { v: 3, type: "Splat", data: { name: "c" } };

		const records = EventVersion.readable(
			[
				{ type: "Death", data: { killer: "a" } },
				{ v: 1, type: "Ping", data: {} },
				{ v: 2, type: "Death", data: { name: "b" } },
				current,
				{ v: 4, type: "Splat", data: { name: "d" } },
			],
			SCHEMA,
		);

		expect(records).toEqual([
			{ v: 3, type: "Splat", data: { name: "a" } },
			{ v: 3, type: "Splat", data: { name: "b" } },
			current,
		]);
		expect(records[2]).toBe(current);
	});
});
