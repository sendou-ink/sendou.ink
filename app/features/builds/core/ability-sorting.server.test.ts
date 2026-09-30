import { describe, expect, test } from "vitest";
import type { BuildAbilitiesTuple } from "~/modules/in-game-lists/types";
import { sortAbilities } from "./ability-sorting.server";

describe("sortAbilities()", () => {
	test("reorders stackable main abilities into canonical order", () => {
		const input: BuildAbilitiesTuple = [
			["ISM", "SS", "SS", "SS"],
			["SSU", "SS", "SS", "SS"],
			["QR", "SS", "SS", "SS"],
		];

		expect(sortAbilities(input)).toEqual([
			["QR", "SS", "SS", "SS"],
			["SSU", "SS", "SS", "SS"],
			["ISM", "SS", "SS", "SS"],
		]);
	});

	test("keeps main-only abilities in their row while sorting stackable mains", () => {
		const input: BuildAbilitiesTuple = [
			["LDE", "QR", "QR", "QR"],
			["SSU", "QR", "QR", "QR"],
			["ISM", "QR", "QR", "QR"],
		];

		expect(sortAbilities(input)).toEqual([
			["LDE", "QR", "QR", "QR"],
			["SSU", "QR", "QR", "QR"],
			["ISM", "QR", "QR", "QR"],
		]);
	});

	test("groups scattered sub abilities by frequency", () => {
		const input: BuildAbilitiesTuple = [
			["OG", "SPU", "ISS", "QR"],
			["NS", "SPU", "ISS", "SPU"],
			["SJ", "SPU", "ISS", "SPU"],
		];

		expect(sortAbilities(input)).toEqual([
			["OG", "SPU", "SPU", "SPU"],
			["NS", "ISS", "ISS", "ISS"],
			["SJ", "SPU", "SPU", "QR"],
		]);
	});

	test("aligns sub rows with mains when two rows want each other's subs", () => {
		const input: BuildAbilitiesTuple = [
			["SSU", "ISM", "ISM", "ISM"],
			["ISM", "SSU", "SSU", "SSU"],
			["SJ", "QSJ", "QSJ", "QSJ"],
		];

		expect(sortAbilities(input)).toEqual([
			["SSU", "SSU", "SSU", "SSU"],
			["ISM", "ISM", "ISM", "ISM"],
			["SJ", "QSJ", "QSJ", "QSJ"],
		]);
	});
});
