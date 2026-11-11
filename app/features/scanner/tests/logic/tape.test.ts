import { describe, expect, test } from "vitest";
import * as EventVersion from "../../core/event-version";
import * as Tape from "../tape";

const EVENTS: Tape.TapeEvent[] = [
	{
		type: "MapStart",
		t: 10.125,
		confidence: 0.8132,
		data: { mode: "SZ", stage: 18 },
	},
	{
		type: "Scoreboard",
		t: 310.5,
		detectedAt: 1_792_268_464_123,
		confidence: 0.9,
		data: { lobby: "PRIVATE", matchScores: [100, 0] },
	},
];

function tapeText(events: readonly Tape.TapeEvent[]) {
	return Tape.serialize({
		description: "one game",
		source: "video.mkv",
		events,
	});
}

describe("Tape.serialize", () => {
	test("round-trips through parse", () => {
		expect(Tape.parse("one-game", tapeText(EVENTS))).toEqual({
			name: "one-game",
			description: "one game",
			source: "video.mkv",
			events: EVENTS,
		});
	});

	test("writes a header line and one line per event", () => {
		expect(tapeText(EVENTS).split("\n")).toHaveLength(EVENTS.length + 2);
	});

	test("rounds fractions to four decimals and keeps integers", () => {
		const [event] = Tape.parse(
			"rounded",
			tapeText([
				{
					type: "Objective",
					t: 12.3456789,
					detectedAt: 1_792_268_464_123,
					confidence: 0.771126010329,
					data: { score: [0.123456, 95] },
				},
			]),
		).events;

		expect(event).toEqual({
			type: "Objective",
			t: 12.3457,
			detectedAt: 1_792_268_464_123,
			confidence: 0.7711,
			data: { score: [0.1235, 95] },
		});
	});

	test("leaves out fields the builders do not read", () => {
		const [event] = Tape.parse(
			"debug",
			tapeText([{ ...EVENTS[0]!, debug: { gateScore: 0.5 } }]),
		).events;

		expect(event).toEqual(EVENTS[0]);
	});
});

describe("Tape.parse", () => {
	test("reads a tape recorded before the event version stamp", () => {
		const text = [
			JSON.stringify({ tape: 1, description: "one game", source: "video.mkv" }),
			...EVENTS.map((event) => JSON.stringify(event)),
		].join("\n");

		expect(Tape.parse("unstamped", text).events).toEqual(EVENTS);
	});

	test("leaves out the events of a tape recorded at a newer event version", () => {
		const text = tapeText(EVENTS).replace(
			`"events":${EventVersion.CURRENT}`,
			`"events":${EventVersion.CURRENT + 1}`,
		);

		expect(Tape.parse("newer", text).events).toEqual([]);
	});

	test.each([
		{ why: "an empty file", text: "" },
		{ why: "a missing header", text: `${JSON.stringify(EVENTS[0])}\n` },
		{
			why: "another version",
			text: `${JSON.stringify({ tape: 2, description: "", source: "" })}\n`,
		},
		{
			why: "a line that is not an event",
			text: `${tapeText(EVENTS)}${JSON.stringify({ type: "MapStart" })}\n`,
		},
	])("throws on $why", ({ text }) => {
		expect(() => Tape.parse("broken", text)).toThrow("tape broken");
	});
});
