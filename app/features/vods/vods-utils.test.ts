import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import { dayMonthYearToDatabaseTimestamp } from "~/utils/dates";
import type { Vod } from "./vods-types";
import {
	extractYoutubeIdFromVideoUrl,
	generateYoutubeTimestamps,
	hoursMinutesSecondsStringToSeconds,
	secondsToHoursMinutesSecondString,
	vodToVideoBeingAdded,
} from "./vods-utils";

describe("extractYoutubeIdFromVideoUrl", () => {
	test("extracts YouTube ID from a standard YouTube URL", () => {
		const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	test("extracts YouTube ID from a shortened YouTube URL", () => {
		const url = "https://youtu.be/dQw4w9WgXcQ";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	test("extracts YouTube ID from a YouTube live URL", () => {
		const url = "https://www.youtube.com/live/dQw4w9WgXcQ";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	test("strips share tracking params from a shortened YouTube URL", () => {
		const url = "https://youtu.be/fuj_pSAbU-A?si=mAzDxgrIJWLO1ykq";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("fuj_pSAbU-A");
	});

	test("strips extra query params from a standard YouTube URL", () => {
		const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	test("strips query params from a YouTube live URL", () => {
		const url = "https://www.youtube.com/live/dQw4w9WgXcQ?feature=shared";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	test("strips url fragments", () => {
		const url = "https://youtu.be/dQw4w9WgXcQ#t=1m";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBe("dQw4w9WgXcQ");
	});

	test("returns null for an invalid YouTube URL", () => {
		const url = "https://www.example.com/watch?v=dQw4w9WgXcQ";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBeNull();
	});

	test("returns null for a URL without a video ID", () => {
		const url = "https://www.youtube.com/watch?v=";
		const result = extractYoutubeIdFromVideoUrl(url);
		expect(result).toBeNull();
	});
});

describe("secondsToHoursMinutesSecondString", () => {
	test("converts seconds to HH:MM:SS format", () => {
		const result = secondsToHoursMinutesSecondString(3661);
		expect(result).toBe("1:01:01");
	});

	test("converts seconds to MM:SS format if less than an hour", () => {
		const result = secondsToHoursMinutesSecondString(61);
		expect(result).toBe("1:01");
	});

	test("handles zero seconds", () => {
		const result = secondsToHoursMinutesSecondString(0);
		expect(result).toBe("0:00");
	});

	test("throws an error for a negative number of seconds", () => {
		expect(() => secondsToHoursMinutesSecondString(-1)).toThrow(
			"Negative number of seconds",
		);
	});

	test("throws an error for a non-integer number of seconds", () => {
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
	test("includes intro line when first match starts after 0", () => {
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

	test("does not include intro line when first match starts at 0", () => {
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

	test("does not include weapon for CAST type", () => {
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

	test("uses long mode names when resolver returns them", () => {
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

describe("vodToVideoBeingAdded", () => {
	// youtubePublishedAt is noon UTC of the chosen day, so it must be read back in UTC; a timezone
	// east of UTC+12 has already rolled over to the next day, making the bug deterministic
	const originalTimezone = process.env.TZ;
	beforeAll(() => {
		process.env.TZ = "Pacific/Kiritimati";
	});
	afterAll(() => {
		process.env.TZ = originalTimezone;
	});

	test("round-trips the stored day/month/year regardless of server timezone", () => {
		const date = { day: 5, month: 0, year: 2024 };
		const vod: Vod = {
			id: 1,
			title: "Test VOD",
			type: "TOURNAMENT",
			youtubeId: "dQw4w9WgXcQ",
			youtubePublishedAt: dayMonthYearToDatabaseTimestamp(date),
			submitterUserId: 1,
			matches: [],
		};

		const result = vodToVideoBeingAdded(vod);

		expect(result.date).toEqual(date);
	});
});

describe("hoursMinutesSecondsStringToSeconds", () => {
	test("converts HH:MM:SS format to seconds", () => {
		const result = hoursMinutesSecondsStringToSeconds("1:01:01");
		expect(result).toBe(3661);
	});

	test("converts MM:SS format to seconds", () => {
		const result = hoursMinutesSecondsStringToSeconds("1:01");
		expect(result).toBe(61);
	});

	test("converts MM:SS format to seconds (zero padded minutes)", () => {
		const result = hoursMinutesSecondsStringToSeconds("01:01");
		expect(result).toBe(61);
	});

	test("handles zero seconds", () => {
		const result = hoursMinutesSecondsStringToSeconds("0:00");
		expect(result).toBe(0);
	});

	test("throws an error for an invalid format", () => {
		expect(() => hoursMinutesSecondsStringToSeconds("1:01:01:01")).toThrow(
			"Invalid time format",
		);
	});
});
