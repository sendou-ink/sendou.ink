import { describe, expect, test } from "vitest";
import * as EventVersion from "../../core/event-version";

/** v1 `Death.killer` became `name` in v2; v2 `Ping` has no v3 equivalent; v3 renamed `Death` to `Splat`. */
type Event = Record<string, unknown> & { type: string; data: unknown };

const SCHEMA = {
	current: 3,
	steps: {
		1: (event: Event) =>
			event.type === "Death"
				? {
						...event,
						data: { name: (event.data as { killer: string }).killer },
					}
				: event,
		2: (event: Event) => {
			if (event.type === "Ping") return null;
			return { ...event, type: event.type === "Death" ? "Splat" : event.type };
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

	test("scores a read from before per-field scores as a whole, at its confidence", () => {
		const event = {
			id: 7,
			type: "Death",
			t: 12,
			confidence: 0.81,
			data: { name: "a" },
		};

		expect(EventVersion.upgradedFrom(undefined, event)).toEqual({
			id: 7,
			type: "Death",
			t: 12,
			scores: { "*": 0.81 },
			data: { name: "a" },
		});
	});

	test("turns a status read's flags into evidence of one confident read per slot", () => {
		const off = [false, false, false, false];
		const event = {
			type: "PlayerStatus",
			t: 12,
			scores: {
				"special.0.1,dead.0.1": 0.7,
				"special.1.2,dead.1.2": 0.9,
			},
			data: {
				time: 140,
				special: [[false, true, false, false], off],
				dead: [off, [false, false, true, false]],
				cast: null,
			},
		};

		const alive = [0.9, 0.05, 0.05];
		expect(EventVersion.upgradedFrom(2, event)).toEqual({
			type: "PlayerStatus",
			t: 12,
			scores: { "slots.0.1": 0.7, "slots.1.2": 0.9 },
			data: {
				time: 140,
				slots: [
					[alive, [0.05, 0.9, 0.05], alive, alive],
					[alive, alive, [0.05, 0.05, 0.9], alive],
				],
				cast: null,
			},
		});
	});

	test("returns an event stamped current as the same object", () => {
		const event = { type: "Death", scores: { name: 0.8 }, data: { name: "a" } };

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
