import { describe, expect, test } from "vitest";
import { parseCoordinates } from "./coordinates";

describe("parseCoordinates", () => {
	test.each([
		{
			why: "comma separated",
			text: "30.2636, -97.7397",
			expected: { latitude: 30.2636, longitude: -97.7397 },
		},
		{
			why: "space separated",
			text: "60.2033 24.9364",
			expected: { latitude: 60.2033, longitude: 24.9364 },
		},
		{
			why: "surrounding whitespace",
			text: "  -33.8688,151.2093 ",
			expected: { latitude: -33.8688, longitude: 151.2093 },
		},
		{
			why: "whole degrees",
			text: "0, 0",
			expected: { latitude: 0, longitude: 0 },
		},
	])("parses $why", ({ text, expected }) => {
		expect(parseCoordinates(text)).toEqual(expected);
	});

	test.each([
		{ why: "empty", text: "" },
		{ why: "one number", text: "30.2636" },
		{ why: "latitude out of range", text: "91, 0" },
		{ why: "longitude out of range", text: "0, 181" },
		{ why: "degrees and minutes", text: "30°15'49\"N 97°44'23\"W" },
		{ why: "trailing text", text: "30.2636, -97.7397 Austin" },
	])("rejects $why", ({ text }) => {
		expect(parseCoordinates(text)).toBeNull();
	});
});
