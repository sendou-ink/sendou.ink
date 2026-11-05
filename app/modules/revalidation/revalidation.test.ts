import { describe, expect, test } from "vitest";
import * as Revalidation from "./revalidation";

describe("Revalidation.dataPathOf", () => {
	test.each([
		{ why: "root", page: "/", expected: "/_.data" },
		{
			why: "nested page",
			page: "/u/sendou/builds",
			expected: "/u/sendou/builds.data",
		},
		{
			why: "search kept",
			page: "/to/1/brackets?idx=2",
			expected: "/to/1/brackets.data?idx=2",
		},
		{
			why: "index param dropped",
			page: "/plus?index&a=1",
			expected: "/plus.data?a=1",
		},
	])("$why", ({ page, expected }) => {
		expect(Revalidation.dataPathOf(page)).toBe(expected);
	});
});

describe("Revalidation.none", () => {
	test("keeps the result alongside the opt out", () => {
		expect(Revalidation.none({ ok: true })).toEqual({
			ok: true,
			[Revalidation.REVALIDATE_KEY]: false,
		});
	});
});
