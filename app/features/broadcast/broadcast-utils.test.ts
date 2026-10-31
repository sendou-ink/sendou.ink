import { describe, expect, test } from "vitest";
import { inkColorVars } from "./broadcast-utils";

const ink = { key: "lockYellowPurple", isFlipped: false } as const;

describe("inkColorVars", () => {
	test("colors the left team with the first color and picks readable text", () => {
		expect(inkColorVars({ ink, swapSides: false })).toEqual({
			"--bc-team-a": "#F0EB24",
			"--bc-team-a-text": "#15131f",
			"--bc-team-b": "#6236DF",
			"--bc-team-b-text": "#fff",
		});
	});

	test.each([
		{
			why: "flipped",
			producer: { ink: { ...ink, isFlipped: true }, swapSides: false },
		},
		{ why: "sides swapped", producer: { ink, swapSides: true } },
	])("gives the left team the second color when $why", ({ producer }) => {
		expect(inkColorVars(producer)["--bc-team-a"]).toBe("#6236DF");
	});

	test("keeps the theme's colors without ink colors", () => {
		expect(inkColorVars({ ink: null, swapSides: false })).toEqual({});
	});
});
