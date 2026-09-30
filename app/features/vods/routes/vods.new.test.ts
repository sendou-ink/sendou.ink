import { describe, expect, test } from "vitest";
import { HOURS_MINUTES_SECONDS_REGEX } from "../vods-schemas";
import { formatTime } from "./vods.new";

describe("formatTime", () => {
	test("formats times under an hour as M:SS", () => {
		expect(formatTime(754)).toBe("12:34");
	});

	test("player time of a 100+ minute VOD passes the startsAt validation", () => {
		const twoHours46Minutes40Seconds = 10000;

		expect(formatTime(twoHours46Minutes40Seconds)).toMatch(
			HOURS_MINUTES_SECONDS_REGEX,
		);
	});
});
