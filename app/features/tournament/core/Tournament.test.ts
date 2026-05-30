import { describe, expect, it } from "vitest";
import { bracketProgressionLabel, splitTournamentName } from "./Tournament";

describe("splitTournamentName", () => {
	const series = [{ name: "In The Zone" }, { name: "Low Ink" }];

	it("splits the trailing number subtext after the series name", () => {
		expect(splitTournamentName("In The Zone 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	it("splits a non-numeric subtext after the series name", () => {
		expect(splitTournamentName("Low Ink May 2026", series)).toEqual({
			name: "Low Ink",
			subtext: "May 2026",
		});
	});

	it("matches the series name case-insensitively", () => {
		expect(splitTournamentName("in the zone 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	it("strips separators between the series name and the subtext", () => {
		expect(splitTournamentName("In The Zone - 54", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	it("trims trailing whitespace after the subtext", () => {
		expect(splitTournamentName("In The Zone 54 ", series)).toEqual({
			name: "In The Zone",
			subtext: "54",
		});
	});

	it("returns name only when the name does not start with a series name", () => {
		expect(splitTournamentName("Picnic Weekly", series)).toEqual({
			name: "Picnic Weekly",
		});
	});

	it("returns name only when the name equals the series name", () => {
		expect(splitTournamentName("In The Zone", series)).toEqual({
			name: "In The Zone",
		});
	});

	it("returns name only when there are no series", () => {
		expect(splitTournamentName("In The Zone 54", [])).toEqual({
			name: "In The Zone 54",
		});
	});

	it("prefers the longest matching series name", () => {
		expect(
			splitTournamentName("In The Zone Masters 5", [
				{ name: "In The Zone" },
				{ name: "In The Zone Masters" },
			]),
		).toEqual({
			name: "In The Zone Masters",
			subtext: "5",
		});
	});
});

describe("bracketProgressionLabel", () => {
	it("returns the short code for a single stage", () => {
		expect(bracketProgressionLabel([{ type: "single_elimination" }])).toBe(
			"SE",
		);
	});

	it("joins stages with an arrow", () => {
		expect(
			bracketProgressionLabel([
				{ type: "round_robin" },
				{ type: "single_elimination" },
			]),
		).toBe("RR → SE");
	});

	it("collapses consecutive duplicate stages", () => {
		expect(
			bracketProgressionLabel([
				{ type: "single_elimination" },
				{ type: "single_elimination" },
				{ type: "double_elimination" },
			]),
		).toBe("SE → DE");
	});

	it("returns empty string for empty progression", () => {
		expect(bracketProgressionLabel([])).toBe("");
	});
});
