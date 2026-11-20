import { describe, expect, test } from "vitest";
import { typicalPlan } from "../tests/fixtures";
import * as PlanCommands from "./PlanCommands";
import * as PlanDocument from "./PlanDocument";
import * as PlanEditor from "./PlanEditor";

describe("PlanCommands.switchMap", () => {
	test("keeps the players in their slots and clears the board", () => {
		const plan = typicalPlan();
		plan.slots[2] = { ...plan.slots[2]!, hidden: true };
		const editor = PlanEditor.create(plan);

		editor.apply(PlanCommands.switchMap(editor.getDocument(), { stageId: 3 }));

		const document = editor.getDocument();
		expect(document.stageId).toBe(3);
		expect(document.slots.map((player) => player?.weaponId)).toEqual(
			typicalPlan().slots.map((player) => player?.weaponId),
		);
		expect(document.slots.map((player) => player?.hidden)).toEqual([
			false,
			false,
			true,
			false,
			false,
			false,
			false,
			false,
		]);
		expect(document.markers).toEqual([]);
		expect(document.drawings).toEqual([]);
		expect(document.ink.every((cell) => cell === 0)).toBe(true);
		expect(document.objective).toEqual({ mode: "SZ", zones: {} });
	});

	test("puts every token back where a newly added player of its slot goes", () => {
		const plan = typicalPlan();
		plan.slots[2] = { ...plan.slots[2]!, hidden: true };
		const editor = PlanEditor.create(plan);

		editor.apply(PlanCommands.switchMap(editor.getDocument(), { stageId: 3 }));

		const empty = PlanDocument.empty({ stageId: 3, mode: "SZ" });
		const newPlayerPositions = plan.slots.map((_, slot) => {
			const added = PlanEditor.create(empty);
			added.apply(
				PlanCommands.setWeapon(empty, slot as PlanDocument.SlotIndex, 40),
			);
			return added.getDocument().slots[slot]?.position;
		});
		expect(
			editor.getDocument().slots.map((player) => player?.position),
		).toEqual(newPlayerPositions);
	});

	test("is undone in one step", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.switchMap(editor.getDocument(), { stageId: 3 }));
		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
		expect(editor.canUndo()).toBe(false);
	});

	test("changes nothing for the map the plan is on", () => {
		const plan = typicalPlan();

		expect(PlanCommands.switchMap(plan, { stageId: plan.stageId })).toEqual([]);
	});

	test.each([
		{ why: "a stage that has it", stageId: 7, expected: "lowTide" },
		{ why: "a stage without it", stageId: 3, expected: undefined },
	] as const)("sets the variant for $why", ({ stageId, expected }) => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(
			PlanCommands.switchMap(editor.getDocument(), {
				stageId,
				variant: "lowTide",
			}),
		);

		expect(editor.getDocument().variant).toBe(expected);
	});

	test.each([
		{ why: "high to low tide", from: undefined, to: "lowTide" },
		{ why: "low to high tide", from: "lowTide", to: undefined },
	] as const)(
		"switches the water level from $why on the same stage, clearing the board",
		({ from, to }) => {
			const editor = PlanEditor.create({
				...typicalPlan(),
				stageId: 7,
				variant: from,
			});

			editor.apply(
				PlanCommands.switchMap(editor.getDocument(), {
					stageId: 7,
					variant: to,
				}),
			);

			expect(editor.getDocument().variant).toBe(to);
			expect(editor.getDocument().drawings).toEqual([]);
		},
	);
});

describe("PlanCommands.switchMode", () => {
	test("resets only the objective", () => {
		const plan = typicalPlan();

		const operations = PlanCommands.switchMode(plan, "RM");

		expect(operations).toEqual([
			{ type: "setObjective", objective: PlanDocument.emptyObjective("RM") },
		]);
	});

	test("changes nothing for the same mode", () => {
		expect(PlanCommands.switchMode(typicalPlan(), "SZ")).toEqual([]);
	});
});

describe("PlanCommands.setWeapon", () => {
	test("fills an empty slot with a new player on their team's side of the map", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		const editor = PlanEditor.create(plan);

		editor.apply(PlanCommands.setWeapon(plan, 2, 40));
		editor.apply(PlanCommands.setWeapon(editor.getDocument(), 6, 50));

		const [teamA, teamB] = [2, 6].map(
			(slot) => editor.getDocument().slots[slot]!,
		);
		expect(teamA).toMatchObject({ weaponId: 40, hidden: false });
		expect(teamA.position![0]).toBeLessThan(PlanDocument.MAP_SIZE.width / 2);
		expect(teamB.position![0]).toBeGreaterThan(PlanDocument.MAP_SIZE.width / 2);
	});

	test("leaves a new player off the map with onMap: false", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		const editor = PlanEditor.create(plan);

		editor.apply(PlanCommands.setWeapon(plan, 2, 40, { onMap: false }));

		expect(editor.getDocument().slots[2]).toEqual(PlanDocument.newPlayer(40));
	});

	test("stacks a team's new players top to bottom in slot order", () => {
		let plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		for (const slot of [0, 1, 2, 3] as const) {
			const editor = PlanEditor.create(plan);
			editor.apply(PlanCommands.setWeapon(plan, slot, 40));
			plan = editor.getDocument();
		}

		const ys = plan.slots.slice(0, 4).map((player) => player!.position![1]);
		expect(ys).toEqual([...ys].sort((a, b) => a - b));
		expect(new Set(ys).size).toBe(4);
	});

	test("switches the weapon, keeping the token and dropping the old kit's markers", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.setWeapon(editor.getDocument(), 5, 50));

		const document = editor.getDocument();
		expect(document.slots[5]).toEqual({
			...typicalPlan().slots[5],
			weaponId: 50,
			specialActive: false,
		});
		expect(document.markers.map((marker) => marker.owner)).toEqual([0, 4]);
	});

	test("is undone in one step", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.setWeapon(editor.getDocument(), 5, 50));
		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
	});

	test("changes nothing for the same weapon", () => {
		const plan = typicalPlan();

		expect(PlanCommands.setWeapon(plan, 0, plan.slots[0]!.weaponId)).toEqual(
			[],
		);
	});
});

describe("PlanCommands.emptySlot", () => {
	test("removes the player and their markers, undone in one step", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.emptySlot(editor.getDocument(), 0));

		expect(editor.getDocument().slots[0]).toBeNull();
		expect(editor.getDocument().markers.map((marker) => marker.owner)).toEqual([
			4, 5,
		]);

		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
	});

	test("changes nothing for an empty slot", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });

		expect(PlanCommands.emptySlot(plan, 0)).toEqual([]);
	});
});

describe("PlanCommands.placePlayer", () => {
	const planWith = (player: Partial<PlanDocument.PlanPlayer>) => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.slots[1] = { ...PlanDocument.newPlayer(40), ...player };
		plan.slots[5] = { ...PlanDocument.newPlayer(50), ...player };
		return plan;
	};

	const placedAt = (
		plan: PlanDocument.PlanDocument,
		slot: PlanDocument.SlotIndex,
		position?: PlanDocument.Point,
	) => {
		const editor = PlanEditor.create(plan);
		editor.apply(PlanCommands.placePlayer(plan, slot, position));
		return editor.getDocument().slots[slot];
	};

	test("puts an unplaced token on its team's side", () => {
		const teamA = placedAt(planWith({}), 1)!.position!;
		const teamB = placedAt(planWith({}), 5)!.position!;

		expect(teamA[0]).toBeLessThan(PlanDocument.MAP_SIZE.width / 2);
		expect(teamB[0]).toBeGreaterThan(PlanDocument.MAP_SIZE.width / 2);
	});

	test("shows a hidden token where it was", () => {
		expect(
			placedAt(planWith({ hidden: true, position: [100, 200] }), 1),
		).toMatchObject({
			hidden: false,
			position: [100, 200],
		});
	});

	test("moves the token to the given position, kept on the map", () => {
		expect(
			placedAt(planWith({ position: [100, 200] }), 1, [2500.4, 300.6])
				?.position,
		).toEqual([PlanDocument.MAP_SIZE.width, 301]);
	});

	test("changes nothing for a token already on the map", () => {
		expect(
			PlanCommands.placePlayer(planWith({ position: [100, 200] }), 1),
		).toEqual([]);
	});

	test("changes nothing for an empty slot", () => {
		expect(PlanCommands.placePlayer(planWith({}), 0)).toEqual([]);
	});
});
