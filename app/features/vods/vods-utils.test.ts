import { describe, expect, it } from "vitest";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import {
	extractYoutubeIdFromVideoUrl,
	generateYoutubeTimestamps,
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

function makeMatch(overrides: {
	startsAt: number;
	mode: ModeShort;
	stageId: StageId;
	weapons: MainWeaponId[];
}) {
	return { id: 1, ...overrides };
}

const WEAPON_NAMES: Record<number, string> = {
	40: "Splattershot",
	200: "Luna Blaster",
	6010: "Tenta Brella",
	7010: "Tri-Stringer",
};

const STAGE_NAMES: Record<number, string> = {
	0: "Scorch Gorge",
	2: "Hagglefish Market",
	7: "Mahi-Mahi Resort",
	10: "MakoMart",
};

const MODE_LONG_NAMES: Record<string, string> = {
	SZ: "Splat Zones",
	TC: "Tower Control",
	RM: "Rainmaker",
	CB: "Clam Blitz",
};

const RESOLVERS = {
	weaponName: (id: number) => WEAPON_NAMES[id] ?? String(id),
	stageName: (id: number) => STAGE_NAMES[id] ?? String(id),
	modeName: (mode: string) => mode,
};

const LONG_MODE_RESOLVERS = {
	...RESOLVERS,
	modeName: (mode: string) => MODE_LONG_NAMES[mode] ?? mode,
};

describe("generateYoutubeTimestamps", () => {
	it("should include intro line when first match starts after 0", () => {
		const matches = [
			makeMatch({
				startsAt: 521,
				mode: "SZ",
				stageId: 7,
				weapons: [40 as MainWeaponId],
			}),
			makeMatch({
				startsAt: 759,
				mode: "TC",
				stageId: 2,
				weapons: [7010 as MainWeaponId],
			}),
		];

		const result = generateYoutubeTimestamps(matches, "TOURNAMENT", RESOLVERS);

		expect(result).toBe(
			"0:00 Intro\n8:41 Splattershot / SZ Mahi-Mahi Resort\n12:39 Tri-Stringer / TC Hagglefish Market",
		);
	});

	it("should not include intro line when first match starts at 0", () => {
		const matches = [
			makeMatch({
				startsAt: 0,
				mode: "RM",
				stageId: 0,
				weapons: [40 as MainWeaponId],
			}),
		];

		const result = generateYoutubeTimestamps(matches, "SCRIM", RESOLVERS);

		expect(result).toBe("0:00 Splattershot / RM Scorch Gorge");
	});

	it("should not include weapon for CAST type", () => {
		const matches = [
			makeMatch({
				startsAt: 25,
				mode: "CB",
				stageId: 10,
				weapons: [200 as MainWeaponId, 6010 as MainWeaponId],
			}),
		];

		const result = generateYoutubeTimestamps(matches, "CAST", RESOLVERS);

		expect(result).toBe("0:00 Intro\n0:25 CB MakoMart");
	});

	it("should use long mode names when resolver returns them", () => {
		const matches = [
			makeMatch({
				startsAt: 521,
				mode: "SZ",
				stageId: 7,
				weapons: [40 as MainWeaponId],
			}),
			makeMatch({
				startsAt: 759,
				mode: "RM",
				stageId: 2,
				weapons: [7010 as MainWeaponId],
			}),
		];

		const result = generateYoutubeTimestamps(
			matches,
			"TOURNAMENT",
			LONG_MODE_RESOLVERS,
		);

		expect(result).toBe(
			"0:00 Intro\n8:41 Splattershot / Splat Zones Mahi-Mahi Resort\n12:39 Tri-Stringer / Rainmaker Hagglefish Market",
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
