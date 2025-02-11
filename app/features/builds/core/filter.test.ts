import { describe, expect, test } from "vitest";
import type { Tables } from "~/db/tables";
import type {
	Ability,
	BuildAbilitiesTuple,
	ModeShort,
} from "~/modules/in-game-lists";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { filterBuilds } from "./filter.server";

const createBuild = ({
	headAbilities,
	modes,
	updatedAt,
}: {
	headAbilities: [Ability, Ability, Ability, Ability];
	modes?: ModeShort[] | null;
	updatedAt?: Tables["Build"]["updatedAt"];
}): {
	abilities: BuildAbilitiesTuple;
	modes: ModeShort[] | null;
	updatedAt: number;
} => {
	return {
		abilities: [
			headAbilities,
			["SSU", "SSU", "SSU", "SSU"],
			["SSU", "SSU", "SSU", "SSU"],
		],
		modes: modes === undefined ? ["SZ", "TC", "RM", "CB"] : modes,
		updatedAt:
			updatedAt === undefined ? dateToDatabaseTimestamp(new Date()) : updatedAt,
	};
};

describe("Filter builds", () => {
	test("returns correct build back based on abilities (AT_LEAST)", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({ headAbilities: ["ISS", "ISS", "ISM", "ISM"] }),
				createBuild({ headAbilities: ["ISM", "ISM", "ISM", "ISM"] }),
			],
			count: 2,
			filters: [
				{
					type: "ability",
					ability: "ISM",
					value: 10,
					comparison: "AT_LEAST",
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["ISM", "ISM", "ISM", "ISM"]);
	});

	test("returns correct build back based on abilities (AT_MOST)", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({ headAbilities: ["ISS", "ISS", "ISM", "ISM"] }),
				createBuild({ headAbilities: ["ISM", "ISM", "ISM", "ISM"] }),
			],
			count: 2,
			filters: [
				{
					type: "ability",
					ability: "ISM",
					value: 6,
					comparison: "AT_MOST",
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["ISS", "ISS", "ISM", "ISM"]);
	});

	test("filters based on main ability (true)", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({ headAbilities: ["T", "ISM", "ISM", "ISM"] }),
				createBuild({ headAbilities: ["ISS", "ISS", "ISM", "ISM"] }),
			],
			count: 2,
			filters: [
				{
					type: "ability",
					ability: "T",
					value: true,
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["T", "ISM", "ISM", "ISM"]);
	});

	test("filters based on main ability (false)", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({ headAbilities: ["T", "ISM", "ISM", "ISM"] }),
				createBuild({ headAbilities: ["ISS", "ISS", "ISM", "ISM"] }),
			],
			count: 2,
			filters: [
				{
					type: "ability",
					ability: "T",
					value: false,
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["ISS", "ISS", "ISM", "ISM"]);
	});

	test("filters based on mode", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({
					headAbilities: ["ISS", "ISM", "ISM", "ISM"],
					modes: ["SZ"],
				}),
				createBuild({
					headAbilities: ["ISM", "ISM", "ISM", "ISM"],
					modes: null,
				}),
				createBuild({ headAbilities: ["ISM", "ISM", "ISM", "ISM"], modes: [] }),
			],
			count: 3,
			filters: [
				{
					type: "mode",
					mode: "SZ",
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["ISS", "ISM", "ISM", "ISM"]);
	});

	test("filters based on many modes", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({
					headAbilities: ["ISS", "ISM", "ISM", "ISM"],
					modes: ["SZ", "TC"],
				}),
				createBuild({
					headAbilities: ["ISM", "ISM", "ISM", "ISM"],
					modes: ["SZ"],
				}),
				createBuild({
					headAbilities: ["ISM", "ISM", "ISM", "ISM"],
					modes: ["TC"],
				}),
			],
			count: 3,
			filters: [
				{
					type: "mode",
					mode: "SZ",
				},
				{
					type: "mode",
					mode: "TC",
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["ISS", "ISM", "ISM", "ISM"]);
	});

	test("filters based on date", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({
					headAbilities: ["ISS", "ISM", "ISM", "ISM"],
					updatedAt: dateToDatabaseTimestamp(new Date(2023, 0, 1)),
				}),
				createBuild({
					headAbilities: ["ISM", "ISM", "ISM", "ISM"],
					updatedAt: dateToDatabaseTimestamp(new Date(2021, 0, 1)),
				}),
			],
			count: 2,
			filters: [
				{
					type: "date",
					date: "2022-01-01",
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["ISS", "ISM", "ISM", "ISM"]);
	});

	test("combines filters of same type", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({ headAbilities: ["T", "ISM", "ISM", "ISM"] }),
				createBuild({ headAbilities: ["T", "RES", "RES", "RES"] }),
				createBuild({ headAbilities: ["ISS", "ISS", "ISM", "ISM"] }),
			],
			count: 2,
			filters: [
				{
					type: "ability",
					ability: "T",
					value: true,
				},
				{
					type: "ability",
					ability: "ISM",
					value: 9,
					comparison: "AT_LEAST",
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["T", "ISM", "ISM", "ISM"]);
	});

	test("combines filters of different type", () => {
		const filtered = filterBuilds({
			builds: [
				// has both
				createBuild({
					headAbilities: ["ISS", "ISM", "ISM", "ISM"],
					updatedAt: dateToDatabaseTimestamp(new Date(2023, 0, 1)),
				}),
				// has abilities
				createBuild({
					headAbilities: ["ISM", "ISM", "ISM", "ISM"],
					updatedAt: dateToDatabaseTimestamp(new Date(2021, 0, 1)),
				}),
				// has date
				createBuild({
					headAbilities: ["ISS", "ISS", "ISM", "ISM"],
					updatedAt: dateToDatabaseTimestamp(new Date(2023, 0, 1)),
				}),
			],
			count: 2,
			filters: [
				{
					type: "date",
					date: "2022-01-01",
				},
				{
					type: "ability",
					ability: "ISM",
					value: 9,
					comparison: "AT_LEAST",
				},
			],
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0].abilities[0]).toEqual(["ISS", "ISM", "ISM", "ISM"]);
	});

	test("count limits returned builds", () => {
		const filtered = filterBuilds({
			builds: [
				createBuild({ headAbilities: ["ISM", "ISM", "ISM", "ISM"] }),
				createBuild({ headAbilities: ["ISM", "ISM", "ISM", "ISM"] }),
				createBuild({ headAbilities: ["ISM", "ISM", "ISM", "ISM"] }),
			],
			count: 2,
			filters: [],
		});

		expect(filtered.length).toBe(2);
	});
});
