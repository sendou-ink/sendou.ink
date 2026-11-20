import { describe, expect, test } from "vitest";
import * as ScanLog from "../../core/scan-log";

const LANES = [
	{ tStart: 0, tEnd: 30 },
	{ tStart: 30, tEnd: 60 },
];

function failed(detector: string): ScanLog.ScanLogCheck {
	return { detector, pass: false, parsed: false, reads: [] };
}

function parsed(
	detector: string,
	reads: ScanLog.ScanLogRead[],
	variant?: string,
): ScanLog.ScanLogCheck {
	return {
		detector,
		pass: true,
		parsed: true,
		reads,
		...(variant === undefined ? null : { variant }),
	};
}

/** Two lanes: a frame with a failing gate, a suppressed one and a parse, then a frame of the second lane. */
function recordedLog(): ScanLog.ScanLog {
	const log = ScanLog.create(LANES);
	ScanLog.record(log, 0, 1.5, failed("scoreboard"));
	ScanLog.record(log, 0, 1.5, {
		detector: "minimap",
		pass: true,
		variant: "overlay",
		parsed: false,
		reads: [],
	});
	ScanLog.record(
		log,
		0,
		1.5,
		parsed(
			"objective",
			[
				{ type: "Objective", scores: [0.8935, 0.91] },
				{ type: "PlayerStatus", scores: [1, 1, 0.573] },
			],
			"zones",
		),
	);
	ScanLog.record(log, 1, 30.25, parsed("kill", []));
	return log;
}

describe("ScanLog.record", () => {
	test("gathers the checks of one frame and reads them back as recorded", () => {
		const log = recordedLog();

		expect(ScanLog.frames(log, log.lanes[0]!)).toEqual([
			{
				t: 1.5,
				checks: [
					failed("scoreboard"),
					{
						detector: "minimap",
						pass: true,
						variant: "overlay",
						parsed: false,
						reads: [],
					},
					parsed(
						"objective",
						[
							{ type: "Objective", scores: [0.8935, 0.91] },
							{ type: "PlayerStatus", scores: [1, 1, 0.573] },
						],
						"zones",
					),
				],
			},
		]);
	});

	test("keeps each lane's frames apart", () => {
		const log = recordedLog();

		expect(ScanLog.frames(log, log.lanes[1]!)).toEqual([
			{ t: 30.25, checks: [parsed("kill", [])] },
		]);
		expect(ScanLog.frameCount(log)).toBe(2);
	});

	test("starts a new frame when a detector is checked again at the same time", () => {
		const log = ScanLog.create(LANES);
		ScanLog.record(log, 0, 5, failed("scoreboard"));
		ScanLog.record(log, 0, 5, failed("kill"));

		ScanLog.record(log, 0, 5, failed("scoreboard"));

		expect(
			ScanLog.frames(log, log.lanes[0]!).map((frame) =>
				frame.checks.map((check) => check.detector),
			),
		).toEqual([["scoreboard", "kill"], ["scoreboard"]]);
	});

	test("drops the variant of a gate that failed", () => {
		const log = ScanLog.create(LANES);

		ScanLog.record(log, 0, 5, { ...failed("objective"), variant: "zones" });

		expect(ScanLog.frames(log, log.lanes[0]!)[0]!.checks).toEqual([
			failed("objective"),
		]);
	});

	test("throws for a lane the log does not have", () => {
		const log = ScanLog.create(LANES);

		expect(() => ScanLog.record(log, 2, 5, failed("kill"))).toThrow(
			"no lane 2",
		);
	});
});

describe("ScanLog.parse", () => {
	test("reads a log back from its JSON", () => {
		const log = recordedLog();

		expect(ScanLog.parse(JSON.parse(JSON.stringify(log)))).toEqual(log);
	});

	test.each<{ why: string; change: (log: Raw) => void; reason: string }>([
		{
			why: "another version",
			change: (log) => {
				log.v = 2;
			},
			reason: "version 2",
		},
		{
			why: "an unknown key",
			change: (log) => {
				log.extra = 1;
			},
			reason: "unexpected key extra",
		},
		{
			why: "a detector id that is not kebab-case",
			change: (log) => {
				log.detectors[0] = "../etc";
			},
			reason: "detectors",
		},
		{
			why: "a detector listed twice",
			change: (log) => {
				log.detectors[1] = log.detectors[0]!;
			},
			reason: "detectors",
		},
		{
			why: "a lane ending before it starts",
			change: (log) => {
				log.lanes[0]!.tEnd = -1;
			},
			reason: "lane 0 has no valid tStart/tEnd",
		},
		{
			why: "a frame without its masks",
			change: (log) => {
				log.lanes[0]!.frames[0] = [1.5, 1];
			},
			reason: "lane 0 frame 0 is malformed",
		},
		{
			why: "a mask naming a detector the log does not list",
			change: (log) => {
				log.lanes[0]!.frames[0]![1] = 2 ** 10;
			},
			reason: "malformed mask",
		},
		{
			why: "a parse without a passing gate",
			change: (log) => {
				log.lanes[1]!.frames[0] = [30.25, 8, 0, 8];
			},
			reason: "gate did not pass",
		},
		{
			why: "reads of a parse that did not run",
			change: (log) => {
				log.lanes[1]!.frames[0] = [30.25, 8, 8, 0, [3, null, 0, 1, 0.9]];
			},
			reason: "reads of a parse that did not run",
		},
		{
			why: "a read naming an event type the log does not list",
			change: (log) => {
				log.lanes[1]!.frames[0] = [30.25, 8, 8, 8, [3, null, 7, 1, 0.9]];
			},
			reason: "malformed read",
		},
		{
			why: "a read holding fewer scores than it counts",
			change: (log) => {
				log.lanes[1]!.frames[0] = [30.25, 8, 8, 8, [3, null, 0, 2, 0.9]];
			},
			reason: "malformed read",
		},
		{
			why: "a score outside 0..1",
			change: (log) => {
				log.lanes[1]!.frames[0] = [30.25, 8, 8, 8, [3, null, 0, 1, 1.5]];
			},
			reason: "malformed read",
		},
		{
			why: "a frame earlier than the one before it",
			change: (log) => {
				log.lanes[0]!.frames.push([1, 1, 0, 0]);
			},
			reason: "goes back in time",
		},
	])("refuses $why", ({ change, reason }) => {
		const log: Raw = JSON.parse(JSON.stringify(recordedLog()));
		change(log);

		expect(() => ScanLog.parse(log)).toThrow(reason);
	});
});

/** A log's JSON, loose enough to break. */
interface Raw {
	v: number;
	detectors: string[];
	lanes: { tStart: number; tEnd: number; frames: unknown[][] }[];
	[key: string]: unknown;
}
