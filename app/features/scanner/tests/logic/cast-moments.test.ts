import { describe, expect, test } from "vitest";
import { castMomentWindows } from "../../core/clips/moments";
import type { StreakGame } from "../../core/clips/scoring";
import type {
	ScannerMatchObjective,
	ScannerMatchObjectiveSample,
} from "../../core/scanner-match";

const kills = (...killTimes: number[]) =>
	killTimes.map((t) => ({ t, time: null, name: null }));

const sample = (
	t: number,
	score: ScannerMatchObjectiveSample["score"],
): ScannerMatchObjectiveSample => ({
	t,
	time: null,
	score,
	penalty: [null, null],
	control: null,
});

const objective = (
	mode: ScannerMatchObjective["mode"],
	...samples: ScannerMatchObjectiveSample[]
): ScannerMatchObjective => ({ mode, samples });

/** One team's count falling in steps of `step` points a second from `from`. */
const falling = ({
	team,
	startT,
	from,
	to,
	step,
}: {
	team: 0 | 1;
	startT: number;
	from: number;
	to: number;
	step: number;
}) =>
	Array.from({ length: Math.floor((from - to) / step) + 1 }, (_, idx) => {
		const score = from - idx * step;
		return sample(startT + idx, team === 0 ? [score, 100] : [100, score]);
	});

const windowsOf = (
	{
		kills: gameKills,
		objective: gameObjective,
	}: {
		kills: StreakGame["kills"];
		objective: ScannerMatchObjective | null;
	},
	deaths: number[],
) => castMomentWindows({ kills: gameKills, deaths }, gameObjective);

const seat = (index: number) => ({ team: 0 as const, index });

const moments = (windows: ReturnType<typeof castMomentWindows>) =>
	windows.map((window) => ({
		start: window.start,
		end: window.end,
		kills: window.kills,
		moments: window.moments,
	}));

describe("castMomentWindows", () => {
	test.each([
		{
			why: "two kills back to back are a double",
			killTimes: [100, 102],
			expected: [{ start: 95, end: 105, kills: 2, moments: ["splats"] }],
		},
		{
			why: "two kills a few seconds apart are no double",
			killTimes: [100, 104],
			expected: [],
		},
		{
			why: "three kills a few seconds apart are a triple",
			killTimes: [100, 104, 109],
			expected: [{ start: 95, end: 112, kills: 3, moments: ["splats"] }],
		},
		{
			why: "three kills further apart are no triple",
			killTimes: [100, 108, 116],
			expected: [],
		},
		{
			why: "four kills by the streak rule are one long clip",
			killTimes: [100, 110, 122, 135],
			expected: [{ start: 95, end: 138, kills: 4, moments: ["splats"] }],
		},
	])("$why", ({ killTimes, expected }) => {
		expect(
			moments(windowsOf({ kills: kills(...killTimes), objective: null }, [])),
		).toEqual(expected);
	});

	test("a death between two kills breaks the double", () => {
		expect(
			windowsOf({ kills: kills(100, 102), objective: null }, [101]),
		).toEqual([]);
	});

	test("two players' kills back to back are no double", () => {
		expect(
			windowsOf(
				{
					kills: [
						{ t: 100, time: null, name: null, player: seat(0) },
						{ t: 101, time: null, name: null, player: seat(1) },
					],
					objective: null,
				},
				[],
			),
		).toEqual([]);
	});

	test("four kills across camera switches are one sequence", () => {
		expect(
			moments(
				windowsOf(
					{
						kills: [100, 110, 122, 135].map((t, idx) => ({
							t,
							time: null,
							name: null,
							player: seat(idx),
						})),
						objective: null,
					},
					[],
				),
			),
		).toEqual([{ start: 95, end: 138, kills: 4, moments: ["splats"] }]);
	});

	test("a double inside a longer streak is the streak's", () => {
		expect(
			moments(
				windowsOf({ kills: kills(100, 101, 112, 124), objective: null }, []),
			),
		).toEqual([{ start: 95, end: 127, kills: 4, moments: ["splats"] }]);
	});

	test("kill moments far apart are clips of their own", () => {
		expect(
			moments(
				windowsOf({ kills: kills(100, 101, 200, 201), objective: null }, []),
			),
		).toEqual([
			{ start: 95, end: 104, kills: 2, moments: ["splats"] },
			{ start: 195, end: 204, kills: 2, moments: ["splats"] },
		]);
	});

	test("an overtake confirmed by the next read is a lead taken", () => {
		const windows = windowsOf(
			{
				kills: null,
				objective: objective(
					"SZ",
					sample(100, [90, 95]),
					sample(101, [89, 95]),
					sample(110, [80, 79]),
					sample(111, [80, 78]),
				),
			},
			[],
		);

		expect(moments(windows)).toEqual([
			{ start: 98, end: 114, kills: 0, moments: ["lead"] },
		]);
		expect(windows[0]!.t).toBe(110);
	});

	test.each([
		{
			why: "the game's first lead",
			samples: [
				sample(100, [100, 100]),
				sample(101, [99, 100]),
				sample(102, [98, 100]),
			],
		},
		{
			why: "one read of the other team ahead",
			samples: [
				sample(100, [90, 95]),
				sample(101, [89, 95]),
				sample(110, [89, 85]),
				sample(111, [88, 95]),
			],
		},
		{
			why: "an unread count",
			samples: [
				sample(100, [90, 95]),
				sample(101, [89, 95]),
				sample(110, [null, 85]),
				sample(111, [null, 84]),
			],
		},
	])("$why is no lead taken", ({ samples }) => {
		expect(
			windowsOf({ kills: null, objective: objective("SZ", ...samples) }, []),
		).toEqual([]);
	});

	test("a tower ride of 20 points is a big push", () => {
		expect(
			moments(
				windowsOf(
					{
						kills: null,
						objective: objective(
							"TC",
							...falling({ team: 1, startT: 100, from: 100, to: 76, step: 2 }),
						),
					},
					[],
				),
			),
		).toEqual([{ start: 96, end: 115, kills: 0, moments: ["push"] }]);
	});

	test.each([
		{
			why: "Splat Zones' count running down",
			mode: "SZ" as const,
			samples: falling({ team: 0, startT: 100, from: 100, to: 60, step: 1 }),
		},
		{
			why: "a push of under 20 points",
			mode: "RM" as const,
			samples: falling({ team: 0, startT: 100, from: 100, to: 82, step: 3 }),
		},
		{
			why: "a drop over a long unread stretch",
			mode: "RM" as const,
			samples: [
				sample(100, [100, 100]),
				sample(130, [50, 100]),
				sample(131, [50, 100]),
			],
		},
		{
			why: "two short pushes with a stall between",
			mode: "TC" as const,
			samples: [
				...falling({ team: 0, startT: 100, from: 100, to: 88, step: 3 }),
				...falling({ team: 0, startT: 115, from: 85, to: 73, step: 3 }),
			],
		},
		{
			why: "a single misread count",
			mode: "CB" as const,
			samples: [
				sample(100, [100, 100]),
				sample(101, [70, 100]),
				sample(102, [100, 100]),
			],
		},
	])("$why is no big push", ({ mode, samples }) => {
		expect(
			windowsOf({ kills: null, objective: objective(mode, ...samples) }, []),
		).toEqual([]);
	});

	test("moments whose footage overlaps are one clip", () => {
		const [window, ...rest] = windowsOf(
			{
				kills: kills(104, 105),
				objective: objective(
					"RM",
					...falling({ team: 0, startT: 100, from: 100, to: 70, step: 5 }),
				),
			},
			[],
		);

		expect(rest).toEqual([]);
		expect(window).toMatchObject({
			start: 96,
			end: 109,
			kills: 2,
			moments: ["push", "splats"],
		});
	});

	test("moments that would make a clip over a minute stay apart", () => {
		const windows = windowsOf(
			{
				kills: kills(100, 110, 120, 130, 140, 150),
				objective: objective(
					"RM",
					...falling({ team: 0, startT: 150, from: 100, to: 50, step: 5 }),
				),
			},
			[],
		);

		expect(windows.map((window) => window.moments)).toEqual([
			["splats"],
			["push"],
		]);
	});
});
