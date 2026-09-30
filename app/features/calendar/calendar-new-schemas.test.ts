import * as v from "valibot";
import { describe, expect, test } from "vitest";
import type { TeamPickSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type { StageId } from "~/modules/in-game-lists/types";
import {
	customTeamPickPool,
	teamPickSettingsFromFormValues,
} from "./calendar-new-schemas";
import { calendarNewSchemaServer } from "./calendar-new-schemas.server";
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
	const result = v.safeParse(calendarNewSchemaServer, values);

	return (result.issues ?? []).map((issue) => ({
		path: issue.path?.map((item) => String(item.key)).join("."),
		message: issue.message,
	}));
};

describe("calendarNewSchemaServer team pick", () => {
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
