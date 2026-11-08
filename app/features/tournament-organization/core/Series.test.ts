import { describe, expect, test } from "vitest";
import * as Series from "./Series";

describe("Series.findByEventName", () => {
	const series = [
		{ id: 1, substringMatches: ["low ink"] },
		{ id: 2, substringMatches: ["Swim Or Sink", "sos"] },
	];

	test.each([
		{ why: "lower-cased match", eventName: "Low Ink November", expected: 1 },
		{ why: "mixed-case match", eventName: "swim or sink 42", expected: 2 },
		{ why: "second substring", eventName: "SOS #12", expected: 2 },
		{ why: "no match", eventName: "In The Zone 40", expected: undefined },
	])("$why", ({ eventName, expected }) => {
		expect(Series.findByEventName({ series, eventName })?.id).toBe(expected);
	});
});
