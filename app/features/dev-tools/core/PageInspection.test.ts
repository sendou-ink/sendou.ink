import { describe, expect, test } from "vitest";
import * as PageInspection from "./PageInspection";

describe("PageInspection.findPermissions", () => {
	test("finds permissions objects at any depth with a label of their entity", () => {
		const found = PageInspection.findPermissions({
			tournament: {
				ctx: { name: "In The Zone", permissions: { ORGANIZE: [1, 2] } },
			},
			scrims: [{ id: 5, permissions: { DELETE: [], EDIT: [3] } }],
		});

		expect(found).toEqual([
			{
				path: "tournament.ctx",
				label: "name: In The Zone",
				permissions: { ORGANIZE: [1, 2] },
			},
			{
				path: "scrims[0]",
				label: "id: 5",
				permissions: { DELETE: [], EDIT: [3] },
			},
		]);
	});

	test.each([
		{ why: "not a record", data: { permissions: [1, 2] } },
		{ why: "values not id lists", data: { permissions: { EDIT: true } } },
		{ why: "empty", data: { permissions: {} } },
		{ why: "no data", data: undefined },
	])("ignores a permissions key that is $why", ({ data }) => {
		expect(PageInspection.findPermissions(data)).toEqual([]);
	});
});

describe("PageInspection.formatBytes", () => {
	test.each([
		[512, "512 B"],
		[2048, "2.0 KB"],
		[3 * 1024 * 1024, "3.00 MB"],
	])("%i bytes is %s", (bytes, expected) => {
		expect(PageInspection.formatBytes(bytes)).toBe(expected);
	});
});
