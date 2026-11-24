import { describe, expect, test } from "vitest";
import type { BroadcastMatch, MatchProgress } from "./broadcast-types";
import { gameInk, inkColorVars, splitLeadingImports } from "./broadcast-utils";

const ink = { key: "lockYellowPurple" } as const;

describe("gameInk", () => {
	const gameOneInk = { ...ink, matchId: 1, resultCount: 0 };

	test("gives the ink colors picked for the game the view shows", () => {
		expect(gameInk({ ink: gameOneInk, match: match(1, 0, 1) }, "live")).toBe(
			gameOneInk,
		);
	});

	test.each([
		{
			why: "its result is on air",
			state: { ink: gameOneInk, match: match(1, 1, 1) },
		},
		{
			why: "another match is featured",
			state: { ink: gameOneInk, match: match(2, 0, 0) },
		},
		{ why: "no match is featured", state: { ink: gameOneInk, match: null } },
		{ why: "none were picked", state: { ink: null, match: match(1, 0, 0) } },
	])("gives nothing when $why", ({ state }) => {
		expect(gameInk(state, "live")).toBeNull();
	});

	test("gives nothing for the next game a Take would put on air", () => {
		expect(
			gameInk({ ink: gameOneInk, match: match(1, 0, 1) }, "next"),
		).toBeNull();
	});
});

describe("inkColorVars", () => {
	test("colors the left team, Alpha, with the first color and picks readable text", () => {
		expect(inkColorVars(ink)).toEqual({
			"--bc-team-a": "#F0EB24",
			"--bc-team-a-text": "#15131f",
			"--bc-team-b": "#6236DF",
			"--bc-team-b-text": "#fff",
		});
	});

	test("keeps the theme's colors without ink colors", () => {
		expect(inkColorVars(null)).toEqual({});
	});
});

function match(
	id: number,
	liveResultCount: number,
	nextResultCount: number,
): BroadcastMatch {
	const progress = (resultCount: number) => ({ resultCount }) as MatchProgress;

	return {
		id,
		progress: {
			live: progress(liveResultCount),
			next: progress(nextResultCount),
		},
	} as BroadcastMatch;
}

describe("splitLeadingImports", () => {
	const FONTS =
		'@import url("https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600&display=swap");';

	test.each([
		{
			why: "no imports",
			css: ".a { top: 0; }",
			imports: "",
			rest: ".a { top: 0; }",
		},
		{
			why: "an import",
			css: `${FONTS}\n.a { top: 0; }`,
			imports: FONTS,
			rest: ".a { top: 0; }",
		},
		{
			why: "semicolons in an unquoted url",
			css: "@import url(https://fonts.example/a;b.css);\n.a { top: 0; }",
			imports: "@import url(https://fonts.example/a;b.css);",
			rest: ".a { top: 0; }",
		},
		{
			why: "comments and a charset before the imports",
			css: `/* fonts */\n@charset "utf-8";\n${FONTS}\n@import "b.css";\n.a { top: 0; }`,
			imports: `/* fonts */\n@charset "utf-8";\n${FONTS}\n@import "b.css";`,
			rest: ".a { top: 0; }",
		},
		{
			why: "an import after a rule, which the browser ignores anyway",
			css: `.a { top: 0; }\n${FONTS}`,
			imports: "",
			rest: `.a { top: 0; }\n${FONTS}`,
		},
		{
			why: "an unterminated import",
			css: '@import url("a.css")',
			imports: "",
			rest: '@import url("a.css")',
		},
	])("splits $why", ({ css, imports, rest }) => {
		expect(splitLeadingImports(css)).toEqual({ imports, rest });
	});
});
