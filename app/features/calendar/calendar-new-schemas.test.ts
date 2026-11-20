import { addHours, subHours } from "date-fns";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import type { TeamPickSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { StageId } from "~/modules/in-game-lists/types";
import {
	calendarNewSchema,
	customTeamPickPool,
	teamPickSettingsFromFormValues,
	valuesMovedWithStartTime,
	venueNameAfterAddressPick,
} from "./calendar-new-schemas";
import {
	defaultBracketsFormValues,
	newBracketFormValue,
} from "./calendar-progression-form";
import {
	type CalendarNewFormValues,
	calendarNewFormValues,
} from "./tests/fixtures";

const stages = (count: number) =>
	Array.from({ length: count }, (_, i) => i as StageId);

/** Serialized custom pool with the given amount of stages in Splat Zones and Tower Control. */
const customPool = (szStages: number, tcStages: number) =>
	new MapPool({
		...MapPool.EMPTY.parsed,
		SZ: stages(szStages),
		TC: stages(tcStages),
	}).serialized;

const teamPickValues = (overrides: Partial<CalendarNewFormValues> = {}) =>
	calendarNewFormValues({
		mapPickingStyle: "AUTO",
		teamPickModes: ["SZ", "TC"],
		teamPickCounts: [
			{ mode: "SZ", count: 2 },
			{ mode: "TC", count: 2 },
		],
		teamPickPool: "SENDOUQ",
		...overrides,
	});

const issuesOf = (values: CalendarNewFormValues) => {
	const result = v.safeParse(calendarNewSchema, values);

	return (result.issues ?? []).map((issue) => ({
		path: issue.path?.map((item) => String(item.key)).join("."),
		message: issue.message,
	}));
};

describe("calendarNewSchema team pick", () => {
	test("accepts team pick settings the pool can serve", () => {
		expect(issuesOf(teamPickValues())).toEqual([]);
	});

	test("rejects a team picked tournament without modes", () => {
		expect(
			issuesOf(teamPickValues({ teamPickModes: [], teamPickCounts: [] })),
		).toContainEqual({
			path: "teamPickModes",
			message: "forms:errors.teamPick.noModes",
		});
	});

	test("rejects a custom pool with fewer stages than picks plus one in a mode", () => {
		expect(
			issuesOf(
				teamPickValues({ teamPickPool: "CUSTOM", pool: customPool(3, 2) }),
			),
		).toContainEqual({
			path: "pool",
			message: "forms:errors.teamPick.poolTooSmall",
		});
	});

	test("accepts a custom pool with one more stage than picks in every mode", () => {
		expect(
			issuesOf(
				teamPickValues({ teamPickPool: "CUSTOM", pool: customPool(3, 3) }),
			),
		).toEqual([]);
	});

	test.each([
		{ why: "zero from the SendouQ pool", pool: "SENDOUQ", count: 0 },
		{ why: "above the SendouQ pool's size", pool: "SENDOUQ", count: 100 },
		{ why: "zero from a custom pool", pool: "CUSTOM", count: 0 },
		{ why: "negative from a custom pool", pool: "CUSTOM", count: -1 },
	] satisfies Array<{
		why: string;
		pool: TeamPickSettings["pool"];
		count: number;
	}>)("rejects a count out of range ($why)", ({ pool, count }) => {
		expect(
			issuesOf(
				teamPickValues({
					teamPickPool: pool,
					teamPickCounts: [
						{ mode: "SZ", count },
						{ mode: "TC", count: 2 },
					],
					pool: pool === "CUSTOM" ? customPool(3, 3) : "",
				}),
			),
		).toContainEqual({
			path: "teamPickCounts",
			message: "forms:errors.teamPick.countOutOfRange",
		});
	});

	test("ignores the team pick fields of an organizer picked tournament", () => {
		expect(
			issuesOf(
				calendarNewFormValues({
					mapPickingStyle: "TO",
					teamPickModes: [],
					teamPickCounts: [{ mode: "SZ", count: 0 }],
				}),
			),
		).toEqual([]);
	});
});

describe("calendarNewSchema organizer picked map pool", () => {
	test.each([
		{ why: "missing", pool: "" },
		{ why: "with no maps", pool: MapPool.EMPTY.serialized },
	])("rejects a pool $why", ({ pool }) => {
		expect(
			issuesOf(calendarNewFormValues({ mapPickingStyle: "TO", pool })),
		).toContainEqual({
			path: "pool",
			message: "forms:errors.mapPoolRequired",
		});
	});

	test("does not require a pool from a calendar event", () => {
		expect(
			issuesOf(
				calendarNewFormValues({
					toToolsEnabled: false,
					date: [new Date(2027, 0, 15)],
					bracketUrl: "https://sendou.ink",
					pool: "",
				}),
			),
		).toEqual([]);
	});
});

describe("calendarNewSchema bracket start times", () => {
	const tournamentStartTime = new Date(2027, 0, 15, 17, 0);

	const withFollowUpStartingAt = (followUpStartTime: Date) => {
		const defaults = defaultBracketsFormValues();

		return calendarNewFormValues({
			startTime: tournamentStartTime,
			brackets: [
				...defaults.brackets,
				{
					...newBracketFormValue(),
					name: "Final Stage",
					startTime: followUpStartTime,
					requiresCheckIn: true,
				},
			],
			progression: [
				...defaults.progression,
				{
					source: "BRACKET",
					sources: [{ bracketIdx: "0", placements: "1,2" }],
				},
			],
		});
	};

	test("accepts a follow-up bracket starting after the tournament", () => {
		expect(
			issuesOf(withFollowUpStartingAt(addHours(tournamentStartTime, 3))),
		).toEqual([]);
	});

	test("rejects a follow-up bracket starting before the tournament", () => {
		expect(
			issuesOf(withFollowUpStartingAt(subHours(tournamentStartTime, 1))),
		).toContainEqual({
			path: "brackets.1.startTime",
			message: "forms:errors.bracketStartBeforeTournamentStart",
		});
	});
});

describe("teamPickSettingsFromFormValues", () => {
	test("sorts the modes in the in-game order keeping their counts", () => {
		expect(
			teamPickSettingsFromFormValues({
				teamPickModes: ["CB", "SZ"],
				teamPickCounts: [
					{ mode: "CB", count: 3 },
					{ mode: "SZ", count: 5 },
				],
				teamPickPool: "ALL",
			}),
		).toEqual({
			modes: [
				{ mode: "SZ", count: 5 },
				{ mode: "CB", count: 3 },
			],
			pool: "ALL",
		});
	});

	test("fills in the default count for a picked mode without one", () => {
		expect(
			teamPickSettingsFromFormValues({
				teamPickModes: ["SZ", "TC", "RM"],
				teamPickCounts: [{ mode: "TC", count: 1 }],
				teamPickPool: "SENDOUQ",
			}).modes,
		).toEqual([
			{ mode: "SZ", count: 3 },
			{ mode: "TC", count: 1 },
			{ mode: "RM", count: 3 },
		]);
	});
});

describe("customTeamPickPool", () => {
	test("keeps only the maps of the picked modes", () => {
		expect(
			customTeamPickPool({
				teamPickModes: ["SZ"],
				pool: customPool(2, 2),
			}),
		).toEqual([
			{ mode: "SZ", stageId: 0 },
			{ mode: "SZ", stageId: 1 },
		]);
	});

	test("is empty without a pool", () => {
		expect(customTeamPickPool({ teamPickModes: ["SZ"], pool: "" })).toEqual([]);
	});
});

describe("valuesMovedWithStartTime", () => {
	const previousStartTime = new Date("2026-01-10T18:00:00Z");
	const newStartTime = addHours(previousStartTime, 7 * 24);

	test("keeps registration closing and follow-up brackets the same distance from the moved start", () => {
		const moved = valuesMovedWithStartTime({
			previousStartTime,
			newStartTime,
			regClosesAt: subHours(previousStartTime, 1),
			brackets: [
				newBracketFormValue(),
				{
					...newBracketFormValue(),
					startTime: addHours(previousStartTime, 24),
				},
			],
		});

		expect(moved?.regClosesAt).toEqual(subHours(newStartTime, 1));
		expect(moved?.brackets.map((bracket) => bracket.startTime)).toEqual([
			null,
			addHours(newStartTime, 24),
		]);
	});

	test.each([
		{ why: "previous start time is unset", from: null, to: newStartTime },
		{
			why: "new start time is cleared",
			from: previousStartTime,
			to: undefined,
		},
	])("moves nothing when the $why", ({ from, to }) => {
		expect(
			valuesMovedWithStartTime({
				previousStartTime: from,
				newStartTime: to,
				regClosesAt: subHours(previousStartTime, 1),
				brackets: [newBracketFormValue()],
			}),
		).toBeNull();
	});
});

describe("venueNameAfterAddressPick", () => {
	const copied = { name: "Old Hall", isCopied: true };
	const picked = { name: "Austin Convention Center", isCopied: false };
	const nothingFilled = { name: "", isCopied: true };

	test.each([
		{
			why: "an empty name gets the place's",
			currentName: "",
			filledName: nothingFilled,
			placeName: "Hilton",
			expected: "Hilton",
		},
		{
			why: "a copied name follows the new place",
			currentName: "Old Hall",
			filledName: copied,
			placeName: "Hilton",
			expected: "Hilton",
		},
		{
			why: "a name filled in from a picked place follows the next one",
			currentName: "Austin Convention Center",
			filledName: picked,
			placeName: "Hilton",
			expected: "Hilton",
		},
		{
			why: "a typed name is kept over a place's",
			currentName: "Big LAN Hall",
			filledName: picked,
			placeName: "Hilton",
			expected: "Big LAN Hall",
		},
		{
			why: "a typed name is kept over a copied one's replacement",
			currentName: "Big LAN Hall",
			filledName: copied,
			placeName: "Hilton",
			expected: "Big LAN Hall",
		},
		{
			why: "a copied name is cleared by an address without a place",
			currentName: "Old Hall",
			filledName: copied,
			placeName: null,
			expected: "",
		},
		{
			why: "a name from a picked place is kept by an address without a place",
			currentName: "Austin Convention Center",
			filledName: picked,
			placeName: null,
			expected: "Austin Convention Center",
		},
		{
			why: "a typed name is kept by an address without a place",
			currentName: "Big LAN Hall",
			filledName: copied,
			placeName: null,
			expected: "Big LAN Hall",
		},
	])("$why", ({ currentName, filledName, placeName, expected }) => {
		expect(
			venueNameAfterAddressPick({ currentName, filledName, placeName }).name,
		).toBe(expected);
	});

	test("a copied name no longer counts as filled in once replaced", () => {
		const first = venueNameAfterAddressPick({
			currentName: "Old Hall",
			filledName: copied,
			placeName: null,
		});
		const second = venueNameAfterAddressPick({
			currentName: "Old Hall",
			filledName: first.filledName,
			placeName: "Hilton",
		});

		expect(second.name).toBe("Old Hall");
	});
});
