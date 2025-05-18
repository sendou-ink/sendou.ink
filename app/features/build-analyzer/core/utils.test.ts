import { describe, expect, test } from "vitest";
import type { AbilityWithUnknown } from "~/modules/in-game-lists/types";
import { buildToAbilityPoints } from "./utils";

describe("buildToAbilityPoints", () => {
	const EMPTY_ROW: [
		AbilityWithUnknown,
		AbilityWithUnknown,
		AbilityWithUnknown,
		AbilityWithUnknown,
	] = ["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"];

	test("calculates ability points correctly", () => {
		const aps = buildToAbilityPoints([
			["SS", "SS", "RSU", "RSU"],
			EMPTY_ROW,
			EMPTY_ROW,
		]);

		expect(aps.get("SS")).toBe(13);
		expect(aps.get("RSU")).toBe(6);
		expect(aps.get("UNKNOWN")).toBe(38);
	});

	test("handles ability doubler correctly", () => {
		const aps = buildToAbilityPoints([
			EMPTY_ROW,
			["AD", "SS", "UNKNOWN", "UNKNOWN"],
			EMPTY_ROW,
		]);

		expect(aps.get("SS")).toBe(6);
	});

	test("does not calculate AP for main only abilities", () => {
		const aps = buildToAbilityPoints([
			["LDE", "SS", "RSU", "RSU"],
			EMPTY_ROW,
			EMPTY_ROW,
		]);

		expect(aps.has("LDE")).toBeFalsy();
	});
});
