import { describe, expect, it } from "vitest";
import type {
	DamageMultiplierWithHistory,
	ParsedWeaponParams,
} from "../weapon-params-types";
import {
	buildKitPatchHistories,
	buildWeaponPatchHistory,
	DAMAGE_MULTIPLIER_PARAM_KEY,
	damageMultipliersForWeapon,
	SPECIAL_POINTS_PARAM_KEY,
} from "./weapon-params";

const VERSIONS = ["1.0.0", "2.0.0", "3.0.0"];

const emptyParsed = (weaponId: number): ParsedWeaponParams => ({
	weaponId,
	categories: {},
});

const row = (overrides: {
	mainWeaponIds?: number[];
	subWeaponIds?: number[];
	specialWeaponIds?: number[];
	targets: DamageMultiplierWithHistory[];
}) => ({
	mainWeaponIds: [],
	subWeaponIds: [],
	specialWeaponIds: [],
	...overrides,
});

describe("damageMultipliersForWeapon", () => {
	it("collects only rows applying to the weapon for the given kind", () => {
		const rows = {
			a: row({
				specialWeaponIds: [11],
				targets: [{ target: "Chariot", current: 2, history: [] }],
			}),
			b: row({
				specialWeaponIds: [12],
				targets: [{ target: "ShockSonar", current: 2, history: [] }],
			}),
		};

		const result = damageMultipliersForWeapon(rows, 11, "special");

		expect(result.map((m) => m.target)).toEqual(["Chariot"]);
	});

	it("de-duplicates identical target histories shared across rows", () => {
		const sharedTarget: DamageMultiplierWithHistory = {
			target: "GreatBarrier_Barrier",
			current: 1.4,
			history: [{ version: "1.0.0", value: 2.8 }],
		};
		const rows = {
			bullet: row({ specialWeaponIds: [10], targets: [sharedTarget] }),
			bombCore: row({
				specialWeaponIds: [10],
				targets: [{ ...sharedTarget }],
			}),
		};

		const result = damageMultipliersForWeapon(rows, 10, "special");

		expect(result).toHaveLength(1);
	});

	it("merges several rows of the same target into the most informative entry", () => {
		const rows = {
			swing: row({
				specialWeaponIds: [11],
				targets: [{ target: "Chariot", current: 4.5, history: [] }],
			}),
			throwBombCore: row({
				specialWeaponIds: [11],
				targets: [
					{
						target: "Chariot",
						current: 3.273,
						history: [
							{ version: "2.0.0", value: 2 },
							{ version: "3.0.0", value: 6 },
						],
					},
				],
			}),
		};

		const result = damageMultipliersForWeapon(rows, 11, "special");

		expect(result).toHaveLength(1);
		expect(result[0].history).toHaveLength(2);
		expect(result[0].current).toBe(3.273);
	});

	it("orders entries like DAMAGE_RECEIVERS", () => {
		const rows = {
			a: row({
				specialWeaponIds: [11],
				targets: [
					{ target: "Wsb_Shield", current: 2, history: [] },
					{ target: "Chariot", current: 3, history: [] },
				],
			}),
		};

		const result = damageMultipliersForWeapon(rows, 11, "special");

		// Chariot precedes Wsb_Shield in DAMAGE_RECEIVERS
		expect(result.map((m) => m.target)).toEqual(["Chariot", "Wsb_Shield"]);
	});
});

describe("buildWeaponPatchHistory damage multipliers", () => {
	const buildWith = (multiplier: DamageMultiplierWithHistory) =>
		buildWeaponPatchHistory(emptyParsed(11), VERSIONS, [], [multiplier]);

	it("attributes a change to the version after the recorded one and flags a higher rate as a buff", () => {
		const patches = buildWith({
			target: "Wsb_Shield",
			current: 2.2,
			history: [{ version: "1.0.0", value: 2 }],
		});

		expect(patches).toHaveLength(1);
		expect(patches[0].version).toBe("2.0.0");
		expect(patches[0].changes).toEqual([
			{
				category: DAMAGE_MULTIPLIER_PARAM_KEY,
				key: "Wsb_Shield",
				from: 2,
				to: 2.2,
				kind: "buff",
			},
		]);
	});

	it("flags a lower rate as a nerf", () => {
		const patches = buildWith({
			target: "NiceBall_Armor",
			current: 1.82,
			history: [{ version: "2.0.0", value: 2.6 }],
		});

		expect(patches).toHaveLength(1);
		expect(patches[0].version).toBe("3.0.0");
		expect(patches[0].changes[0].kind).toBe("nerf");
	});
});

describe("buildKitPatchHistories", () => {
	const kitHistory = () =>
		buildKitPatchHistories({
			mainParsed: emptyParsed(11),
			versions: VERSIONS,
			kits: [{ weaponId: 11, subWeaponId: 1, specialWeaponId: 2 }],
			specialPointsByKit: {
				"11": {
					weaponId: 11,
					current: 180,
					history: [{ version: "1.0.0", value: 200 }],
				},
			},
			mainDamageMultipliers: [
				{
					target: "Wsb_Shield",
					current: 2.2,
					history: [{ version: "1.0.0", value: 2 }],
				},
			],
			subParams: { "1": emptyParsed(1) },
			subDamageMultipliers: {
				"1": [
					{
						target: "Chariot",
						current: 3,
						history: [{ version: "1.0.0", value: 2 }],
					},
				],
			},
			specialParams: { "2": emptyParsed(2) },
			specialDamageMultipliers: {
				"2": [
					{
						target: "NiceBall_Armor",
						current: 1.5,
						history: [{ version: "2.0.0", value: 2 }],
					},
				],
			},
		});

	it("folds the kit's main, sub and special weapon changes into one descending history", () => {
		const [history] = kitHistory();

		expect(history.weaponId).toBe(11);
		expect(history.patches.map((patch) => patch.version)).toEqual([
			"3.0.0",
			"2.0.0",
		]);
	});

	it("tags each change with its source and groups main before sub before special", () => {
		const [history] = kitHistory();

		const v2 = history.patches.find((patch) => patch.version === "2.0.0")!;
		// special points + main damage rate (both main), then the sub weapon's damage rate
		expect(v2.changes.map((change) => change.source)).toEqual([
			"main",
			"main",
			"sub",
		]);
		expect(v2.changes[0].category).toBe(SPECIAL_POINTS_PARAM_KEY);

		const v3 = history.patches.find((patch) => patch.version === "3.0.0")!;
		expect(v3.changes.map((change) => change.source)).toEqual(["special"]);
	});
});
