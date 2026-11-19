import { describe, expect, test } from "vitest";
import { typicalPlan } from "../tests/fixtures";
import * as PlanCommands from "./PlanCommands";
import * as PlanDocument from "./PlanDocument";
import * as PlanEditor from "./PlanEditor";

describe("PlanCommands.switchMap", () => {
	test("keeps the players in their slots and clears the board", () => {
		const plan = typicalPlan();
		plan.slots[2] = { ...plan.slots[2]!, hidden: true, position: null };
		const editor = PlanEditor.create(plan);

		editor.apply(PlanCommands.switchMap(editor.getDocument(), { stageId: 3 }));

		const document = editor.getDocument();
		expect(document.stageId).toBe(3);
		expect(document.slots.map((player) => player?.weaponId)).toEqual(
			typicalPlan().slots.map((player) => player?.weaponId),
		);
		expect(document.slots.every((player) => player?.position === null)).toBe(
			true,
		);
		expect(document.slots.every((player) => player?.hidden === false)).toBe(
			true,
		);
		expect(document.markers).toEqual([]);
		expect(document.drawings).toEqual([]);
		expect(document.ink.every((cell) => cell === 0)).toBe(true);
		expect(document.objective).toEqual({ mode: "SZ", zones: {} });
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
