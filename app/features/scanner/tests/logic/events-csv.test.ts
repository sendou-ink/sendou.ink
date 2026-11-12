import { describe, expect, test } from "vitest";
import { eventsToCsv } from "../../core/csv/events";
import type { DetectedEvent } from "../../core/events";

const COMPLETE: DetectedEvent = {
	type: "MapStart",
	t: 10,
	scores: { mode: 0.8123, stage: 0.9 },
	data: { mode: "SZ", stage: 3 },
};

const MODE_ONLY: DetectedEvent = {
	type: "MapStart",
	t: 20,
	scores: { mode: 0.7654 },
	data: { mode: "SZ", stage: null },
};

function rows(events: readonly DetectedEvent[]): Record<string, string>[] {
	const [header, ...lines] = eventsToCsv(events).trim().split("\r\n");
	const columns = header!.split(",");
	return lines.map((line) =>
		Object.fromEntries(line.split(",").map((cell, i) => [columns[i]!, cell])),
	);
}

describe("eventsToCsv", () => {
	test("lists the score columns after the detection time", () => {
		const [header] = eventsToCsv([]).split("\r\n");

		expect(header).toContain("detected_at,mean_score,complete,");
	});

	test("gives a read's mean field score to three decimals and whether it is complete", () => {
		expect(
			rows([COMPLETE, MODE_ONLY]).map(({ mean_score, complete }) => ({
				mean_score,
				complete,
			})),
		).toEqual([
			{ mean_score: "0.856", complete: "yes" },
			{ mean_score: "0.765", complete: "no" },
		]);
	});
});
