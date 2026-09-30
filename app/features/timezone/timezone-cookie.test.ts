import { describe, expect, test } from "vitest";
import { viewerTimezoneFromCookieHeader } from "./timezone-cookie";

describe("viewerTimezoneFromCookieHeader", () => {
	test.each([
		["timezone=Europe/Helsinki", "Europe/Helsinki"],
		["theme=dark; timezone=Asia/Tokyo; i18n=en", "Asia/Tokyo"],
		["timezone=UTC", "UTC"],
	])("%s -> %s", (header, expected) => {
		expect(viewerTimezoneFromCookieHeader(header)).toBe(expected);
	});

	test.each([
		["$why: no cookie header at all", null],
		["$why: cookie not written yet", "theme=dark"],
		["$why: not a timezone", "timezone=Not/AZone"],
		["$why: empty value", "timezone="],
		["$why: only a prefix of the name matches", "mytimezone=Asia/Tokyo"],
	])("%s", (_why, header) => {
		expect(viewerTimezoneFromCookieHeader(header)).toBeNull();
	});
});
