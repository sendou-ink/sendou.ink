import { describe, expect, test } from "vitest";
import { parseMaplistSource, serializeMaplistSource } from "./source";
import type { TournamentMaplistSource } from "./types";

describe("serializeMaplistSource / parseMaplistSource", () => {
	test.each<{ why: string; source: TournamentMaplistSource; stored: string }>([
		{ why: "picking team's id", source: 123, stored: "123" },
		{ why: "source type", source: "BOTH", stored: "BOTH" },
		{ why: "random source", source: "RANDOM", stored: "RANDOM" },
	])("stores the $why as text and reads it back", ({ source, stored }) => {
		expect(serializeMaplistSource(source)).toBe(stored);
		expect(parseMaplistSource(serializeMaplistSource(source))).toBe(source);
	});
});
