import { readFileSync } from "node:fs";
import type { RawPicoCAD2File } from "picocad2-web";
import { describe, expect, test } from "vitest";
import { analyzeTrophyModel } from "./model-analysis";
import * as XpTrophy from "./XpTrophy";

type VisibleNode = {
	readonly name: string;
	readonly visible: boolean;
	readonly children: readonly VisibleNode[];
};

const masterJson = readFileSync(
	new URL("../data/xp-trophies-master.txt", import.meta.url),
	"utf8",
);
const master: RawPicoCAD2File = JSON.parse(masterJson);

describe("XpTrophy.VARIANTS", () => {
	test("has one trophy per weapon category and milestone", () => {
		const codes = XpTrophy.VARIANTS.map((variant) => variant.code);

		expect(codes).toHaveLength(11 * 4);
		expect(new Set(codes).size).toBe(codes.length);
	});

	test("has a model for every weapon category", () => {
		const modelled = new Set(master.graph.children.map((node) => node.name));
		const missing = XpTrophy.VARIANTS.filter(
			(variant) => !modelled.has(variant.category),
		);

		expect(missing).toEqual([]);
	});
});

describe("XpTrophy.parseCode", () => {
	test.each([
		{
			why: "an X Power trophy",
			code: "xp-shooters-3500",
			expected: { category: "shooters", milestone: 3500 },
		},
		{ why: "a tournament trophy", code: null, expected: null },
		{ why: "an unknown milestone", code: "xp-shooters-3100", expected: null },
		{ why: "an unknown category", code: "xp-bows-3000", expected: null },
	])("parses $why", ({ code, expected }) => {
		const parsed = XpTrophy.parseCode(code);

		expect(
			parsed
				? { category: parsed.category, milestone: parsed.milestone }
				: null,
		).toEqual(expected);
	});

	test("round trips every variant's code", () => {
		for (const variant of XpTrophy.VARIANTS) {
			expect(XpTrophy.parseCode(XpTrophy.code(variant))?.code).toBe(
				variant.code,
			);
		}
	});
});

describe("XpTrophy.milestoneFor", () => {
	test.each([
		{ power: 2999.9, expected: null },
		{ power: 3000, expected: 3000 },
		{ power: 3199.9, expected: 3000 },
		{ power: 3200, expected: 3200 },
		{ power: 3650.4, expected: 3500 },
		{ power: 4100, expected: 4000 },
	])("$power X Power reaches $expected", ({ power, expected }) => {
		expect(XpTrophy.milestoneFor(power)).toBe(expected);
	});
});

describe("XpTrophy.awards", () => {
	const SPLATTERSHOT = 40;
	const SPLAT_ROLLER = 1010;
	const SPLAT_CHARGER = 2010;
	const E_LITER = 2030;

	test("awards the highest milestone reached with each category's weapons", () => {
		expect(
			XpTrophy.awards([
				{ userId: 1, weaponSplId: SPLATTERSHOT, power: 3550 },
				{ userId: 1, weaponSplId: SPLAT_CHARGER, power: 3050 },
				{ userId: 1, weaponSplId: E_LITER, power: 3250 },
				{ userId: 1, weaponSplId: SPLAT_ROLLER, power: 2900 },
			]).toSorted((a, b) => a.code.localeCompare(b.code)),
		).toEqual([
			{ userId: 1, code: "xp-chargers-3200" },
			{ userId: 1, code: "xp-shooters-3500" },
		]);
	});

	test("awards every user separately", () => {
		expect(
			XpTrophy.awards([
				{ userId: 1, weaponSplId: SPLATTERSHOT, power: 3000 },
				{ userId: 2, weaponSplId: SPLATTERSHOT, power: 4000 },
			]),
		).toEqual([
			{ userId: 1, code: "xp-shooters-3000" },
			{ userId: 2, code: "xp-shooters-4000" },
		]);
	});
});

describe("XpTrophy.division", () => {
	const SPLATTERSHOT = 40;
	const SPLAT_CHARGER = 2010;
	const shooters3500 = { category: "shooters", milestone: 3500 } as const;

	test.each([
		{
			why: "Tentatek when only reached there",
			placements: [{ weaponSplId: SPLATTERSHOT, power: 3510, region: "WEST" }],
			expected: "WEST",
		},
		{
			why: "Takoroka when only reached there",
			placements: [{ weaponSplId: SPLATTERSHOT, power: 3510, region: "JPN" }],
			expected: "JPN",
		},
		{
			why: "Takoroka when reached in both",
			placements: [
				{ weaponSplId: SPLATTERSHOT, power: 3700, region: "WEST" },
				{ weaponSplId: SPLATTERSHOT, power: 3510, region: "JPN" },
			],
			expected: "JPN",
		},
		{
			why: "the division the milestone was reached in, not any it was played in",
			placements: [
				{ weaponSplId: SPLATTERSHOT, power: 3510, region: "WEST" },
				{ weaponSplId: SPLATTERSHOT, power: 3400, region: "JPN" },
			],
			expected: "WEST",
		},
		{
			why: "none when only reached with another category",
			placements: [{ weaponSplId: SPLAT_CHARGER, power: 3600, region: "JPN" }],
			expected: null,
		},
	] as const)("is $why", ({ placements, expected }) => {
		expect(XpTrophy.division(placements, shooters3500)).toBe(expected);
	});
});

describe("XpTrophy.variantState", () => {
	const variant = { category: "chargers", milestone: 3500 } as const;
	const state = XpTrophy.variantState(master, variant);
	const children = state.source?.graph.children ?? [];

	test("keeps only the variant's category and the pedestal", () => {
		expect(children.map((node) => node.name).toSorted()).toEqual([
			"chargers",
			"pedestal",
		]);
	});

	test("keeps only the variant's milestone digits on the pedestal", () => {
		const pedestal = children.find((node) => node.name === "pedestal");
		const digitFolders = pedestal?.children
			.map((node) => node.name)
			.filter((name) => /^\d+$/.test(name));

		expect(digitFolders).toEqual(["35"]);
	});

	test("shows every part of the variant without forcing anything visible", () => {
		const hidden = (node: VisibleNode): string[] => [
			...(node.visible ? [] : [node.name]),
			...node.children.flatMap(hidden),
		];

		expect(children.flatMap(hidden)).toEqual([]);
	});

	test("meets the requirements of an uploaded trophy", () => {
		const analysis = analyzeTrophyModel(JSON.stringify(state));

		expect(analysis?.cameraTargetCentered).toBe(true);
		expect(analysis?.backgroundIsAlpha).toBe(true);
	});

	test.each([...new Set(XpTrophy.VARIANTS.map(({ category }) => category))])(
		"spins %s around its center",
		(category) => {
			const [x, , z] =
				XpTrophy.variantState(master, { category, milestone: 3000 }).model
					?.camera?.target ?? [];

			expect([x, z]).toEqual([0, 0]);
		},
	);

	test("leaves the master untouched", () => {
		expect(master).toEqual(JSON.parse(masterJson));
	});
});
