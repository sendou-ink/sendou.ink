import { describe, expect, test } from "vitest";
import * as Availability from "./Availability";
import * as DayTrack from "./DayTrack";

const HELSINKI = "Europe/Helsinki";
const LOS_ANGELES = "America/Los_Angeles";

const at = (date: string, time: string, timezone = HELSINKI) =>
	Availability.localToTimestamp({ date, time, timezone });

const range = (date: string, start: string, end: string, endDate = date) => ({
	startsAt: at(date, start),
	endsAt: at(endDate, end),
});

describe("DayTrack.dayMinutesToTimestamp", () => {
	test("matches localToTimestamp for a same-day time", () => {
		expect(
			DayTrack.dayMinutesToTimestamp({
				date: "2026-08-25",
				minutes: 18 * 60 + 30,
				timezone: HELSINKI,
			}),
		).toBe(at("2026-08-25", "18:30"));
	});

	test("rolls minutes past 1440 into the next day", () => {
		expect(
			DayTrack.dayMinutesToTimestamp({
				date: "2026-08-25",
				minutes: 26 * 60,
				timezone: HELSINKI,
			}),
		).toBe(at("2026-08-26", "02:00"));
	});

	test.each([
		{
			why: "spring",
			date: "2026-03-28",
			minutes: 28 * 60,
			expectedDate: "2026-03-29",
			expectedTime: "04:00",
		},
		{
			why: "autumn",
			date: "2026-10-24",
			minutes: 26 * 60,
			expectedDate: "2026-10-25",
			expectedTime: "02:00",
		},
	])(
		"rolls through the $why DST transition like a hand-entered time",
		({ date, minutes, expectedDate, expectedTime }) => {
			expect(
				DayTrack.dayMinutesToTimestamp({
					date,
					minutes,
					timezone: HELSINKI,
				}),
			).toBe(at(expectedDate, expectedTime));
		},
	);
});

describe("DayTrack.snapMinutes", () => {
	test.each([
		[0, 0],
		[14, 0],
		[15, 30],
		[44, 30],
		[46, 60],
		[1439, 1440],
	])("snaps %i minutes to %i", (minutes, expected) => {
		expect(DayTrack.snapMinutes(minutes)).toBe(expected);
	});
});

const TRACK = { trackStart: 14 * 60, trackEnd: 26 * 60 };
const minuteRange = (start: number, end: number) => ({ start, end });

describe("DayTrack.timeToMinutes", () => {
	test.each([
		["00:00", 0],
		["09:30", 570],
		["23:59", 1439],
	])("resolves %s to %i minutes", (time, expected) => {
		expect(DayTrack.timeToMinutes(time)).toBe(expected);
	});

	test("throws on a malformed time", () => {
		expect(() => DayTrack.timeToMinutes("half past six")).toThrow();
	});
});

describe("DayTrack.minutesToTime", () => {
	test.each([
		{ why: "midnight", minutes: 0, expected: "00:00" },
		{ why: "an evening time", minutes: 1380, expected: "23:00" },
		{ why: "a time past midnight", minutes: 1560, expected: "02:00" },
	])("prints $why as $expected", ({ minutes, expected }) => {
		expect(DayTrack.minutesToTime(minutes)).toBe(expected);
	});
});

describe("DayTrack.dayRangeFromTimes", () => {
	test("keeps a same-day range as entered", () => {
		expect(DayTrack.dayRangeFromTimes("18:00", "22:00")).toEqual(
			minuteRange(1080, 1320),
		);
	});

	test("pushes an end earlier than the start past midnight", () => {
		expect(DayTrack.dayRangeFromTimes("22:00", "02:00")).toEqual(
			minuteRange(1320, 1560),
		);
	});

	test("treats an end equal to the start as an empty range", () => {
		const result = DayTrack.dayRangeFromTimes("18:00", "18:00");

		expect(DayTrack.mergedDayRanges([result])).toEqual([]);
	});
});

describe("DayTrack.mergedDayRanges", () => {
	test("merges overlapping and touching ranges", () => {
		expect(
			DayTrack.mergedDayRanges([
				minuteRange(1200, 1320),
				minuteRange(1080, 1230),
				minuteRange(1320, 1380),
			]),
		).toEqual([minuteRange(1080, 1380)]);
	});

	test("keeps separated ranges apart and drops empty ones", () => {
		expect(
			DayTrack.mergedDayRanges([
				minuteRange(1260, 1380),
				minuteRange(1080, 1140),
				minuteRange(600, 600),
			]),
		).toEqual([minuteRange(1080, 1140), minuteRange(1260, 1380)]);
	});
});

describe("DayTrack.paintedRange", () => {
	test("snaps both ends and orders a backwards drag", () => {
		expect(
			DayTrack.paintedRange({
				anchor: 1307,
				cursor: 1114,
				walls: [],
				...TRACK,
			}),
		).toEqual(minuteRange(1110, 1320));
	});

	test("grows a plain press to one step", () => {
		expect(
			DayTrack.paintedRange({
				anchor: 1085,
				cursor: 1085,
				walls: [],
				...TRACK,
			}),
		).toEqual(minuteRange(1080, 1110));
	});

	test("extends across a wall", () => {
		expect(
			DayTrack.paintedRange({
				anchor: 1080,
				cursor: 1440,
				walls: [minuteRange(1200, 1290)],
				...TRACK,
			}),
		).toEqual(minuteRange(1080, 1440));
	});

	test("returns null when the anchor is inside a wall", () => {
		expect(
			DayTrack.paintedRange({
				anchor: 1230,
				cursor: 1440,
				walls: [minuteRange(1200, 1290)],
				...TRACK,
			}),
		).toBeNull();
	});

	test("stays inside the track and starts before midnight", () => {
		expect(
			DayTrack.paintedRange({
				anchor: 1500,
				cursor: 2000,
				walls: [],
				...TRACK,
			}),
		).toEqual(minuteRange(1410, 1560));
	});

	test("a paint anchored past midnight grows from the day's last step", () => {
		expect(
			DayTrack.paintedRange({
				anchor: 1470,
				cursor: 1470,
				walls: [],
				...TRACK,
			}),
		).toEqual(minuteRange(1410, 1500));
	});
});

describe("DayTrack.movedRange", () => {
	test("snaps the move to the entry step", () => {
		expect(
			DayTrack.movedRange({
				range: minuteRange(1080, 1200),
				delta: 44,
				...TRACK,
			}),
		).toEqual(minuteRange(1110, 1230));
	});

	test("stops at the track edges", () => {
		expect(
			DayTrack.movedRange({
				range: minuteRange(1080, 1200),
				delta: -1000,
				...TRACK,
			}),
		).toEqual(minuteRange(840, 960));
	});

	test("stops the start before midnight", () => {
		expect(
			DayTrack.movedRange({
				range: minuteRange(1350, 1380),
				delta: 120,
				...TRACK,
			}),
		).toEqual(minuteRange(1410, 1440));
	});
});

describe("DayTrack.resizedRange", () => {
	test("keeps at least one step when dragged past the other edge", () => {
		expect(
			DayTrack.resizedRange({
				range: minuteRange(1080, 1200),
				edge: "end",
				cursor: 900,
				...TRACK,
			}),
		).toEqual(minuteRange(1080, 1110));
	});

	test("stops the dragged edge at the track edges", () => {
		expect(
			DayTrack.resizedRange({
				range: minuteRange(1320, 1440),
				edge: "start",
				cursor: 500,
				...TRACK,
			}),
		).toEqual(minuteRange(840, 1440));
	});

	test("snaps the dragged edge", () => {
		expect(
			DayTrack.resizedRange({
				range: minuteRange(1080, 1200),
				edge: "end",
				cursor: 1307,
				...TRACK,
			}),
		).toEqual(minuteRange(1080, 1320));
	});

	test("stops the start edge before midnight", () => {
		expect(
			DayTrack.resizedRange({
				range: minuteRange(1380, 1560),
				edge: "start",
				cursor: 1500,
				...TRACK,
			}),
		).toEqual(minuteRange(1410, 1560));
	});
});

describe("DayTrack.timestampToDayMinutes", () => {
	test("reads a same-day time as minutes from midnight", () => {
		expect(
			DayTrack.timestampToDayMinutes({
				date: "2026-08-25",
				timestamp: at("2026-08-25", "18:30"),
				timezone: HELSINKI,
			}),
		).toBe(18 * 60 + 30);
	});

	test("counts a time on the next day on past 1440", () => {
		expect(
			DayTrack.timestampToDayMinutes({
				date: "2026-08-25",
				timestamp: at("2026-08-26", "02:00"),
				timezone: HELSINKI,
			}),
		).toBe(26 * 60);
	});

	test("reads the wall clock across a DST change instead of counting elapsed minutes", () => {
		expect(
			DayTrack.timestampToDayMinutes({
				date: "2026-10-24",
				timestamp: at("2026-10-25", "02:00"),
				timezone: HELSINKI,
			}),
		).toBe(26 * 60);
	});

	test("is the inverse of dayMinutesToTimestamp", () => {
		const minutes = 23 * 60 + 30;
		const timestamp = DayTrack.dayMinutesToTimestamp({
			date: "2026-08-25",
			minutes,
			timezone: LOS_ANGELES,
		});

		expect(
			DayTrack.timestampToDayMinutes({
				date: "2026-08-25",
				timestamp,
				timezone: LOS_ANGELES,
			}),
		).toBe(minutes);
	});
});

describe("DayTrack.splitByDayTracks", () => {
	test("keeps a range ending before its track's end whole", () => {
		const evening = range("2026-08-25", "18:00", "02:00", "2026-08-26");

		expect(DayTrack.splitByDayTracks([evening], HELSINKI)).toEqual([evening]);
	});

	test("continues what runs past the track's end on the next day's track", () => {
		expect(
			DayTrack.splitByDayTracks(
				[range("2026-08-25", "20:00", "08:00", "2026-08-26")],
				HELSINKI,
			),
		).toEqual([
			range("2026-08-25", "20:00", "06:00", "2026-08-26"),
			range("2026-08-26", "06:00", "08:00"),
		]);
	});

	test("cuts where the track ends in the given timezone", () => {
		const helsinkiNight = range("2026-08-25", "20:00", "08:00", "2026-08-26");

		expect(DayTrack.splitByDayTracks([helsinkiNight], "UTC")).toHaveLength(1);
	});
});
