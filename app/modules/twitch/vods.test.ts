import { describe, expect, it } from "vitest";
import { parseTwitchDuration } from "./vods";

describe("parseTwitchDuration()", () => {
	it("parses hours, minutes and seconds", () => {
		expect(parseTwitchDuration("1h2m3s")).toBe(3723);
	});

	it("parses hours only", () => {
		expect(parseTwitchDuration("2h")).toBe(7200);
	});

	it("parses minutes only", () => {
		expect(parseTwitchDuration("45m")).toBe(2700);
	});

	it("parses seconds only", () => {
		expect(parseTwitchDuration("30s")).toBe(30);
	});

	it("parses hours and minutes without seconds", () => {
		expect(parseTwitchDuration("1h30m")).toBe(5400);
	});

	it("parses hours and seconds without minutes", () => {
		expect(parseTwitchDuration("2h15s")).toBe(7215);
	});

	it("parses minutes and seconds without hours", () => {
		expect(parseTwitchDuration("5m10s")).toBe(310);
	});

	it("returns 0 for empty string", () => {
		expect(parseTwitchDuration("")).toBe(0);
	});

	it("parses large values", () => {
		expect(parseTwitchDuration("99h59m59s")).toBe(359999);
	});
});
