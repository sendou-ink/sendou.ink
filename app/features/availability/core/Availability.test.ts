import { describe, expect, test } from "vitest";
import * as Availability from "./Availability";

const HELSINKI = "Europe/Helsinki";
const LOS_ANGELES = "America/Los_Angeles";

const at = (date: string, time: string, timezone = HELSINKI) =>
	Availability.localToTimestamp({ date, time, timezone });

const range = (date: string, start: string, end: string, endDate = date) => ({
	startsAt: at(date, start),
	endsAt: at(endDate, end),
});

const HOUR = 60 * 60;

describe("Availability.weekStartsAt", () => {
	test.each([
		{ why: "a Monday morning", date: "2026-08-24", time: "09:00" },
		{ why: "a Sunday just before midnight", date: "2026-08-30", time: "23:59" },
		{ why: "a Wednesday", date: "2026-08-26", time: "18:00" },
	])("resolves $why to the Monday that starts its week", ({ date, time }) => {
		expect(
			Availability.weekStartsAt(new Date(at(date, time) * 1000), HELSINKI),
		).toBe(at("2026-08-24", "00:00"));
	});

	test("resolves the same instant to a different Monday midnight per timezone", () => {
		const instant = new Date(at("2026-08-26", "18:00") * 1000);

		expect(Availability.weekStartsAt(instant, HELSINKI)).toBe(
			at("2026-08-24", "00:00"),
		);
		expect(Availability.weekStartsAt(instant, LOS_ANGELES)).toBe(
			at("2026-08-24", "00:00", LOS_ANGELES),
		);
	});
});

describe("Availability.weekRange", () => {
	test.each([
		{ why: "no DST transition", date: "2026-08-26", hours: 168 },
		{ why: "the spring transition", date: "2026-03-25", hours: 167 },
		{ why: "the autumn transition", date: "2026-10-21", hours: 169 },
	])("is $hours hours long for a week with $why", ({ date, hours }) => {
		const { startsAt, endsAt } = Availability.weekRange(
			new Date(at(date, "12:00") * 1000),
			HELSINKI,
		);

		expect((endsAt - startsAt) / HOUR).toBe(hours);
	});

	test("ends at the Monday midnight that starts the next week", () => {
		const { endsAt } = Availability.weekRange(
			new Date(at("2026-08-26", "12:00") * 1000),
			HELSINKI,
		);

		expect(endsAt).toBe(at("2026-08-31", "00:00"));
	});
});

describe("Availability.dateInTimezone", () => {
	test("places a slot on the viewer's day, not the author's", () => {
		const pastMidnightInHelsinki = at("2026-08-25", "00:30");

		expect(Availability.dateInTimezone(pastMidnightInHelsinki, HELSINKI)).toBe(
			"2026-08-25",
		);
		expect(
			Availability.dateInTimezone(pastMidnightInHelsinki, LOS_ANGELES),
		).toBe("2026-08-24");
	});

	test("round trips with localToTimestamp", () => {
		const timestamp = at("2026-08-25", "22:30");

		expect(Availability.dateInTimezone(timestamp, HELSINKI)).toBe("2026-08-25");
		expect(Availability.timeInTimezone(timestamp, HELSINKI)).toBe("22:30");
	});
});

describe("Availability.dayMinutesToTimestamp", () => {
	test("matches localToTimestamp for a same-day time", () => {
		expect(
			Availability.dayMinutesToTimestamp({
				date: "2026-08-25",
				minutes: 18 * 60 + 30,
				timezone: HELSINKI,
			}),
		).toBe(at("2026-08-25", "18:30"));
	});

	test("rolls minutes past 1440 into the next day", () => {
		expect(
			Availability.dayMinutesToTimestamp({
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
				Availability.dayMinutesToTimestamp({
					date,
					minutes,
					timezone: HELSINKI,
				}),
			).toBe(at(expectedDate, expectedTime));
		},
	);
});

describe("Availability.overlaps", () => {
	test.each([
		{
			why: "ranges sharing an hour",
			other: ["19:00", "21:00"],
			expected: true,
		},
		{ why: "ranges only touching", other: ["20:00", "22:00"], expected: false },
		{ why: "ranges apart", other: ["21:00", "22:00"], expected: false },
		{ why: "a contained range", other: ["19:00", "19:30"], expected: true },
	])("returns $expected for $why", ({ other, expected }) => {
		expect(
			Availability.overlaps(
				range("2026-08-24", "18:00", "20:00"),
				range("2026-08-24", other[0], other[1]),
			),
		).toBe(expected);
	});
});

describe("Availability.normalize", () => {
	test("merges overlapping and touching ranges and sorts them", () => {
		expect(
			Availability.normalize([
				range("2026-08-24", "20:00", "22:00"),
				range("2026-08-24", "18:00", "20:00"),
				range("2026-08-24", "19:00", "21:00"),
				range("2026-08-24", "23:00", "23:30"),
			]),
		).toEqual([
			range("2026-08-24", "18:00", "22:00"),
			range("2026-08-24", "23:00", "23:30"),
		]);
	});

	test("drops ranges with no length", () => {
		expect(
			Availability.normalize([range("2026-08-24", "18:00", "18:00")]),
		).toEqual([]);
	});

	test("keeps a range crossing midnight in one piece", () => {
		expect(
			Availability.normalize([
				range("2026-08-24", "22:00", "02:00", "2026-08-25"),
			]),
		).toEqual([range("2026-08-24", "22:00", "02:00", "2026-08-25")]);
	});
});

describe("Availability.subtract", () => {
	test("splits a range around a busy block inside it", () => {
		expect(
			Availability.subtract(
				[range("2026-08-24", "18:00", "23:00")],
				[range("2026-08-24", "19:00", "21:00")],
			),
		).toEqual([
			range("2026-08-24", "18:00", "19:00"),
			range("2026-08-24", "21:00", "23:00"),
		]);
	});

	test("cuts a busy block reaching over the end of a range", () => {
		expect(
			Availability.subtract(
				[range("2026-08-24", "18:00", "23:00")],
				[range("2026-08-24", "21:00", "02:00", "2026-08-25")],
			),
		).toEqual([range("2026-08-24", "18:00", "21:00")]);
	});

	test("removes a range covered by a busy block", () => {
		expect(
			Availability.subtract(
				[range("2026-08-24", "18:00", "23:00")],
				[range("2026-08-24", "17:00", "23:30")],
			),
		).toEqual([]);
	});

	test("leaves a range a busy block only touches", () => {
		expect(
			Availability.subtract(
				[range("2026-08-24", "18:00", "23:00")],
				[range("2026-08-24", "23:00", "23:30")],
			),
		).toEqual([range("2026-08-24", "18:00", "23:00")]);
	});
});

describe("Availability.clip", () => {
	test("cuts the ends reaching outside the window", () => {
		expect(
			Availability.clip(
				[range("2026-08-30", "22:00", "02:00", "2026-08-31")],
				range("2026-08-24", "00:00", "00:00", "2026-08-31"),
			),
		).toEqual([range("2026-08-30", "22:00", "00:00", "2026-08-31")]);
	});

	test("drops a range entirely outside the window", () => {
		expect(
			Availability.clip(
				[range("2026-08-31", "18:00", "22:00")],
				range("2026-08-24", "00:00", "00:00", "2026-08-31"),
			),
		).toEqual([]);
	});

	test("keeps a range inside the window as is", () => {
		expect(
			Availability.clip(
				[range("2026-08-26", "18:00", "22:00")],
				range("2026-08-24", "00:00", "00:00", "2026-08-31"),
			),
		).toEqual([range("2026-08-26", "18:00", "22:00")]);
	});
});

describe("Availability.availabilityInWindow", () => {
	const window = range("2026-08-30", "18:00", "22:00");
	const busyBlock = (r: { startsAt: number; endsAt: number }) => ({
		...r,
		type: "tournament" as const,
		name: "In The Zone 42",
	});

	test("a slot covering the whole window is available, ranges as reported", () => {
		expect(
			Availability.availabilityInWindow({
				reported: true,
				slots: [range("2026-08-30", "17:00", "23:00")],
				busy: [],
				window,
			}),
		).toEqual({
			status: "available",
			ranges: [range("2026-08-30", "17:00", "23:00")],
		});
	});

	test("a slot covering part of the window is partial, ranges clipped to it", () => {
		expect(
			Availability.availabilityInWindow({
				reported: true,
				slots: [range("2026-08-30", "19:00", "23:00")],
				busy: [],
				window,
			}),
		).toEqual({
			status: "partial",
			ranges: [range("2026-08-30", "19:00", "22:00")],
		});
	});

	test("split slots leaving a gap inside the window are partial even when they span it", () => {
		expect(
			Availability.availabilityInWindow({
				reported: true,
				slots: [
					range("2026-08-30", "17:00", "19:00"),
					range("2026-08-30", "20:00", "23:00"),
				],
				busy: [],
				window,
			}),
		).toEqual({
			status: "partial",
			ranges: [
				range("2026-08-30", "18:00", "19:00"),
				range("2026-08-30", "20:00", "22:00"),
			],
		});
	});

	test("a reported week without overlap is unavailable", () => {
		expect(
			Availability.availabilityInWindow({
				reported: true,
				slots: [range("2026-08-30", "12:00", "17:00")],
				busy: [],
				window,
			}),
		).toEqual({ status: "unavailable" });
	});

	test("a slot only touching the window start is unavailable", () => {
		expect(
			Availability.availabilityInWindow({
				reported: true,
				slots: [range("2026-08-30", "12:00", "18:00")],
				busy: [],
				window,
			}),
		).toEqual({ status: "unavailable" });
	});

	test("no reported week is unknown", () => {
		expect(
			Availability.availabilityInWindow({
				reported: false,
				slots: [],
				busy: [],
				window,
			}),
		).toEqual({ status: "unknown" });
	});

	test("a busy block overlapping the window wins over reported availability", () => {
		const block = busyBlock(range("2026-08-30", "19:00", "21:00"));

		expect(
			Availability.availabilityInWindow({
				reported: true,
				slots: [range("2026-08-30", "17:00", "23:00")],
				busy: [block],
				window,
			}),
		).toEqual({ status: "busy", block });
	});

	test("a busy block wins even when nothing was reported", () => {
		const block = busyBlock(range("2026-08-30", "18:00", "22:00"));

		expect(
			Availability.availabilityInWindow({
				reported: false,
				slots: [],
				busy: [block],
				window,
			}),
		).toEqual({ status: "busy", block });
	});

	test("a busy block outside the window changes nothing", () => {
		expect(
			Availability.availabilityInWindow({
				reported: true,
				slots: [range("2026-08-30", "17:00", "23:00")],
				busy: [busyBlock(range("2026-08-29", "18:00", "22:00"))],
				window,
			}),
		).toEqual({
			status: "available",
			ranges: [range("2026-08-30", "17:00", "23:00")],
		});
	});

	test("a cross-midnight slot covers a window reaching past midnight", () => {
		expect(
			Availability.availabilityInWindow({
				reported: true,
				slots: [range("2026-08-30", "20:00", "02:30", "2026-08-31")],
				busy: [],
				window: range("2026-08-30", "22:00", "02:00", "2026-08-31"),
			}),
		).toEqual({
			status: "available",
			ranges: [range("2026-08-30", "20:00", "02:30", "2026-08-31")],
		});
	});
});

describe("Availability.isoWeekNumber", () => {
	test.each([
		{ why: "a midweek day", date: "2026-08-26", timezone: HELSINKI, week: 35 },
		{
			why: "a new year week counted to the old year",
			date: "2027-01-01",
			timezone: HELSINKI,
			week: 53,
		},
	])("resolves $why to week $week", ({ date, timezone, week }) => {
		expect(
			Availability.isoWeekNumber(at(date, "12:00", timezone), timezone),
		).toBe(week);
	});

	test("resolves an instant near midnight by the timezone's local day", () => {
		const sundayLateHelsinki = at("2026-08-30", "23:30");

		expect(Availability.isoWeekNumber(sundayLateHelsinki, HELSINKI)).toBe(35);
		expect(Availability.isoWeekNumber(sundayLateHelsinki, LOS_ANGELES)).toBe(
			35,
		);
	});
});

describe("Availability.isFirstDayOfWeek", () => {
	test.each([
		{ why: "a Monday", date: "2026-08-24", is: true },
		{ why: "a Sunday", date: "2026-08-30", is: false },
		{ why: "a Wednesday", date: "2026-08-26", is: false },
	])("resolves $why to $is", ({ date, is }) => {
		expect(
			Availability.isFirstDayOfWeek(
				new Date(at(date, "12:00") * 1000),
				HELSINKI,
			),
		).toBe(is);
	});
});

describe("Availability.isLastDayOfWeek", () => {
	test.each([
		{ why: "a Sunday", date: "2026-08-30", is: true },
		{ why: "a Monday", date: "2026-08-24", is: false },
		{ why: "a Saturday", date: "2026-08-29", is: false },
	])("resolves $why to $is", ({ date, is }) => {
		expect(
			Availability.isLastDayOfWeek(
				new Date(at(date, "12:00") * 1000),
				HELSINKI,
			),
		).toBe(is);
	});

	test("resolves an instant by the timezone's local day", () => {
		const mondayEarlyHelsinki = new Date(at("2026-08-31", "01:00") * 1000);

		expect(Availability.isLastDayOfWeek(mondayEarlyHelsinki, HELSINKI)).toBe(
			false,
		);
		expect(Availability.isLastDayOfWeek(mondayEarlyHelsinki, LOS_ANGELES)).toBe(
			true,
		);
	});
});

describe("Availability.playableWindows", () => {
	const members = (
		ranges: Array<Array<[start: string, end: string, endDate?: string]>>,
	) =>
		ranges.map((memberRanges, index) => ({
			userId: index + 1,
			ranges: memberRanges.map(([start, end, endDate]) =>
				range("2026-08-24", start, end, endDate),
			),
		}));

	test("reports the span the required amount of players share as FULL", () => {
		const windows = Availability.playableWindows({
			members: members([
				[["18:00", "23:00"]],
				[["18:00", "23:00"]],
				[["19:00", "23:00"]],
				[["19:00", "22:00"]],
			]),
		});

		expect(windows).toEqual([
			{
				...range("2026-08-24", "19:00", "22:00"),
				tier: "FULL",
				userIds: [1, 2, 3, 4],
			},
		]);
	});

	test("reports a span one player short as ONE_SHORT", () => {
		const windows = Availability.playableWindows({
			members: members([
				[["18:00", "21:00"]],
				[["18:00", "21:00"]],
				[["18:00", "21:00"]],
			]),
		});

		expect(windows).toEqual([
			{
				...range("2026-08-24", "18:00", "21:00"),
				tier: "ONE_SHORT",
				userIds: [1, 2, 3],
			},
		]);
	});

	test("reports nothing when two players short", () => {
		expect(
			Availability.playableWindows({
				members: members([[["18:00", "21:00"]], [["18:00", "21:00"]]]),
			}),
		).toEqual([]);
	});

	test("leaves out a window shorter than the minimum", () => {
		expect(
			Availability.playableWindows({
				members: members([
					[["19:00", "19:30"]],
					[["19:00", "19:30"]],
					[["19:00", "19:30"]],
					[["19:00", "19:30"]],
				]),
			}),
		).toEqual([]);
	});

	test("leaves out a ONE_SHORT window that already contains a FULL one", () => {
		const windows = Availability.playableWindows({
			members: members([
				[["18:00", "23:00"]],
				[["18:00", "23:00"]],
				[["18:00", "23:00"]],
				[["19:00", "22:00"]],
			]),
		});

		expect(windows).toEqual([
			{
				...range("2026-08-24", "19:00", "22:00"),
				tier: "FULL",
				userIds: [1, 2, 3, 4],
			},
		]);
	});

	test("keeps a ONE_SHORT window of a different day than the FULL one", () => {
		const windows = Availability.playableWindows({
			members: [
				{
					userId: 1,
					ranges: [
						range("2026-08-24", "18:00", "22:00"),
						range("2026-08-25", "18:00", "22:00"),
					],
				},
				{
					userId: 2,
					ranges: [
						range("2026-08-24", "18:00", "22:00"),
						range("2026-08-25", "18:00", "22:00"),
					],
				},
				{
					userId: 3,
					ranges: [
						range("2026-08-24", "18:00", "22:00"),
						range("2026-08-25", "18:00", "22:00"),
					],
				},
				{ userId: 4, ranges: [range("2026-08-24", "18:00", "22:00")] },
			],
		});

		expect(windows).toEqual([
			{
				...range("2026-08-24", "18:00", "22:00"),
				tier: "FULL",
				userIds: [1, 2, 3, 4],
			},
			{
				...range("2026-08-25", "18:00", "22:00"),
				tier: "ONE_SHORT",
				userIds: [1, 2, 3],
			},
		]);
	});

	test("reports a window crossing midnight in one piece", () => {
		const windows = Availability.playableWindows({
			members: members([
				[["22:00", "02:00", "2026-08-25"]],
				[["22:00", "02:00", "2026-08-25"]],
				[["22:00", "02:00", "2026-08-25"]],
				[["22:00", "02:00", "2026-08-25"]],
			]),
		});

		expect(windows).toEqual([
			{
				...range("2026-08-24", "22:00", "02:00", "2026-08-25"),
				tier: "FULL",
				userIds: [1, 2, 3, 4],
			},
		]);
	});

	test("does not join two windows separated by a gap", () => {
		const windows = Availability.playableWindows({
			members: members([
				[
					["18:00", "20:00"],
					["21:00", "23:00"],
				],
				[
					["18:00", "20:00"],
					["21:00", "23:00"],
				],
				[
					["18:00", "20:00"],
					["21:00", "23:00"],
				],
				[
					["18:00", "20:00"],
					["21:00", "23:00"],
				],
			]),
		});

		expect(windows.map((window) => window.tier)).toEqual(["FULL", "FULL"]);
		expect(windows[0]).toMatchObject(range("2026-08-24", "18:00", "20:00"));
		expect(windows[1]).toMatchObject(range("2026-08-24", "21:00", "23:00"));
	});
});

describe("Availability.snapMinutes", () => {
	test.each([
		[0, 0],
		[14, 0],
		[15, 30],
		[44, 30],
		[46, 60],
		[1439, 1440],
	])("snaps %i minutes to %i", (minutes, expected) => {
		expect(Availability.snapMinutes(minutes)).toBe(expected);
	});
});

const TRACK = { trackStart: 14 * 60, trackEnd: 26 * 60 };
const minuteRange = (start: number, end: number) => ({ start, end });

describe("Availability.timeToMinutes", () => {
	test.each([
		["00:00", 0],
		["09:30", 570],
		["23:59", 1439],
	])("resolves %s to %i minutes", (time, expected) => {
		expect(Availability.timeToMinutes(time)).toBe(expected);
	});

	test("throws on a malformed time", () => {
		expect(() => Availability.timeToMinutes("half past six")).toThrow();
	});
});

describe("Availability.minutesToTime", () => {
	test.each([
		{ why: "midnight", minutes: 0, expected: "00:00" },
		{ why: "an evening time", minutes: 1380, expected: "23:00" },
		{ why: "a time past midnight", minutes: 1560, expected: "02:00" },
	])("prints $why as $expected", ({ minutes, expected }) => {
		expect(Availability.minutesToTime(minutes)).toBe(expected);
	});
});

describe("Availability.dayRangeFromTimes", () => {
	test("keeps a same-day range as entered", () => {
		expect(Availability.dayRangeFromTimes("18:00", "22:00")).toEqual(
			minuteRange(1080, 1320),
		);
	});

	test("pushes an end earlier than the start past midnight", () => {
		expect(Availability.dayRangeFromTimes("22:00", "02:00")).toEqual(
			minuteRange(1320, 1560),
		);
	});

	test("treats an end equal to the start as an empty range", () => {
		const result = Availability.dayRangeFromTimes("18:00", "18:00");

		expect(Availability.mergedDayRanges([result])).toEqual([]);
	});
});

describe("Availability.mergedDayRanges", () => {
	test("merges overlapping and touching ranges", () => {
		expect(
			Availability.mergedDayRanges([
				minuteRange(1200, 1320),
				minuteRange(1080, 1230),
				minuteRange(1320, 1380),
			]),
		).toEqual([minuteRange(1080, 1380)]);
	});

	test("keeps separated ranges apart and drops empty ones", () => {
		expect(
			Availability.mergedDayRanges([
				minuteRange(1260, 1380),
				minuteRange(1080, 1140),
				minuteRange(600, 600),
			]),
		).toEqual([minuteRange(1080, 1140), minuteRange(1260, 1380)]);
	});
});

describe("Availability.paintedRange", () => {
	test("snaps both ends and orders a backwards drag", () => {
		expect(
			Availability.paintedRange({
				anchor: 1307,
				cursor: 1114,
				walls: [],
				...TRACK,
			}),
		).toEqual(minuteRange(1110, 1320));
	});

	test("grows a plain press to one step", () => {
		expect(
			Availability.paintedRange({
				anchor: 1085,
				cursor: 1085,
				walls: [],
				...TRACK,
			}),
		).toEqual(minuteRange(1080, 1110));
	});

	test("extends across a wall", () => {
		expect(
			Availability.paintedRange({
				anchor: 1080,
				cursor: 1440,
				walls: [minuteRange(1200, 1290)],
				...TRACK,
			}),
		).toEqual(minuteRange(1080, 1440));
	});

	test("returns null when the anchor is inside a wall", () => {
		expect(
			Availability.paintedRange({
				anchor: 1230,
				cursor: 1440,
				walls: [minuteRange(1200, 1290)],
				...TRACK,
			}),
		).toBeNull();
	});

	test("stays inside the track and starts before midnight", () => {
		expect(
			Availability.paintedRange({
				anchor: 1500,
				cursor: 2000,
				walls: [],
				...TRACK,
			}),
		).toEqual(minuteRange(1410, 1560));
	});

	test("a paint anchored past midnight grows from the day's last step", () => {
		expect(
			Availability.paintedRange({
				anchor: 1470,
				cursor: 1470,
				walls: [],
				...TRACK,
			}),
		).toEqual(minuteRange(1410, 1500));
	});
});

describe("Availability.movedRange", () => {
	test("snaps the move to the entry step", () => {
		expect(
			Availability.movedRange({
				range: minuteRange(1080, 1200),
				delta: 44,
				...TRACK,
			}),
		).toEqual(minuteRange(1110, 1230));
	});

	test("stops at the track edges", () => {
		expect(
			Availability.movedRange({
				range: minuteRange(1080, 1200),
				delta: -1000,
				...TRACK,
			}),
		).toEqual(minuteRange(840, 960));
	});

	test("stops the start before midnight", () => {
		expect(
			Availability.movedRange({
				range: minuteRange(1350, 1380),
				delta: 120,
				...TRACK,
			}),
		).toEqual(minuteRange(1410, 1440));
	});
});

describe("Availability.resizedRange", () => {
	test("keeps at least one step when dragged past the other edge", () => {
		expect(
			Availability.resizedRange({
				range: minuteRange(1080, 1200),
				edge: "end",
				cursor: 900,
				...TRACK,
			}),
		).toEqual(minuteRange(1080, 1110));
	});

	test("stops the dragged edge at the track edges", () => {
		expect(
			Availability.resizedRange({
				range: minuteRange(1320, 1440),
				edge: "start",
				cursor: 500,
				...TRACK,
			}),
		).toEqual(minuteRange(840, 1440));
	});

	test("snaps the dragged edge", () => {
		expect(
			Availability.resizedRange({
				range: minuteRange(1080, 1200),
				edge: "end",
				cursor: 1307,
				...TRACK,
			}),
		).toEqual(minuteRange(1080, 1320));
	});

	test("stops the start edge before midnight", () => {
		expect(
			Availability.resizedRange({
				range: minuteRange(1380, 1560),
				edge: "start",
				cursor: 1500,
				...TRACK,
			}),
		).toEqual(minuteRange(1410, 1560));
	});
});
