import { describe, expect, it } from "vitest";
import {
	extractYoutubeIdFromVideoUrl,
	hoursMinutesSecondsStringToSeconds,
	secondsToHoursMinutesSecondString,
} from "./vods-utils";

describe("extractYoutubeIdFromVideoUrl", () => {
	it("should extract YouTube ID from a standard YouTube URL", () => {
		const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	it("should extract YouTube ID from a shortened YouTube URL", () => {
		const url = "https://youtu.be/dQw4w9WgXcQ";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	it("should extract YouTube ID from a YouTube live URL", () => {
		const url = "https://www.youtube.com/live/dQw4w9WgXcQ";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	it("should return null for an invalid YouTube URL", () => {
		const url = "https://www.example.com/watch?v=dQw4w9WgXcQ";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBeNull();
	});

	it("should return null for a URL without a video ID", () => {
		const url = "https://www.youtube.com/watch?v=";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBeNull();
	});
});

describe("secondsToHoursMinutesSecondString", () => {
	it("should convert seconds to HH:MM:SS format", () => {
		const result = secondsToHoursMinutesSecondString(3661);
		expect(result).toBe("1:01:01");
	});

	it("should convert seconds to MM:SS format if less than an hour", () => {
		const result = secondsToHoursMinutesSecondString(61);
		expect(result).toBe("1:01");
	});

	it("should handle zero seconds", () => {
		const result = secondsToHoursMinutesSecondString(0);
		expect(result).toBe("0:00");
	});

	it("should throw an error for a negative number of seconds", () => {
		expect(() => secondsToHoursMinutesSecondString(-1)).toThrow(
			"Negative number of seconds",
		);
	});

	it("should throw an error for a non-integer number of seconds", () => {
		expect(() => secondsToHoursMinutesSecondString(1.5)).toThrow(
			"Non-integer number of seconds",
		);
	});
});

describe("hoursMinutesSecondsStringToSeconds", () => {
	it("should convert HH:MM:SS format to seconds", () => {
		const result = hoursMinutesSecondsStringToSeconds("1:01:01");
		expect(result).toBe(3661);
	});

	it("should convert MM:SS format to seconds", () => {
		const result = hoursMinutesSecondsStringToSeconds("1:01");
		expect(result).toBe(61);
	});

	it("should convert MM:SS format to seconds (zero padded minutes)", () => {
		const result = hoursMinutesSecondsStringToSeconds("01:01");
		expect(result).toBe(61);
	});

	it("should handle zero seconds", () => {
		const result = hoursMinutesSecondsStringToSeconds("0:00");
		expect(result).toBe(0);
	});

	it("should throw an error for an invalid format", () => {
		expect(() => hoursMinutesSecondsStringToSeconds("1:01:01:01")).toThrow(
			"Invalid time format",
		);
	});
});
