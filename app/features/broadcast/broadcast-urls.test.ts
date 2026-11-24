import { describe, expect, test } from "vitest";
import { isOnAirPath, isOverlayPath } from "./broadcast-urls";

describe("isOnAirPath", () => {
	test.each([
		{ path: "/broadcast/program", expected: true },
		{ path: "/to/12/broadcast/sendouink/program", expected: true },
		{ path: "/broadcast/program/stream", expected: false },
		{ path: "/to/12/broadcast/sendouink/design/canvas", expected: false },
		{ path: "/to/12/broadcast/sendouink", expected: false },
	])("$path is $expected", ({ path, expected }) => {
		expect(isOnAirPath(path)).toBe(expected);
	});
});

describe("isOverlayPath", () => {
	test.each([
		{ path: "/broadcast/program", expected: true },
		{ path: "/to/12/broadcast/sendouink/program", expected: true },
		{ path: "/to/12/broadcast/sendouink/design/canvas", expected: true },
		{ path: "/to/12/broadcast/sendouink/design", expected: false },
		{ path: "/to/12/broadcast", expected: false },
	])("$path is $expected", ({ path, expected }) => {
		expect(isOverlayPath(path)).toBe(expected);
	});
});
