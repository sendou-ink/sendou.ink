import { describe, expect, test, vi } from "vitest";
import { typicalPlan } from "../tests/fixtures";
import type { Point } from "./PlanDocument";
import * as PlanEditor from "./PlanEditor";
import type { PlanOperation } from "./PlanOperation";

const moveFirstPlayer = (position: Point): PlanOperation => ({
	type: "updatePlayer",
	slot: 0,
	patch: { position },
});

describe("PlanEditor.create", () => {
	test("undoes and redoes one apply at a time", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(moveFirstPlayer([1, 1]));
		editor.apply(moveFirstPlayer([2, 2]));
		editor.undo();

		expect(editor.getDocument().slots[0]?.position).toEqual([1, 1]);

		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
		expect(editor.canUndo()).toBe(false);

		editor.redo();
		editor.redo();

		expect(editor.getDocument().slots[0]?.position).toEqual([2, 2]);
		expect(editor.canRedo()).toBe(false);
	});

	test("undoes the operations of one apply together", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply([
			{ type: "removeDrawing", id: "stroke00" },
			{ type: "removeDrawing", id: "stroke01" },
			{ type: "setPlayer", slot: 7, player: null },
		]);
		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
	});

	test("undoes everything applied in a group as one step", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.beginGroup();
		editor.apply(moveFirstPlayer([1, 1]));
		editor.beginGroup();
		editor.apply({ type: "setInk", cells: [[10, 1]] });
		editor.endGroup();
		editor.apply(moveFirstPlayer([2, 2]));
		editor.endGroup();
		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
		expect(editor.canUndo()).toBe(false);

		editor.redo();

		expect(editor.getDocument().slots[0]?.position).toEqual([2, 2]);
		expect(editor.getDocument().ink[10]).toBe(1);
	});

	test("undoes a drag of many moves to where it started", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.beginGroup();
		for (let x = 0; x < 100; x++) {
			editor.apply([
				moveFirstPlayer([x, x]),
				{ type: "updateMarker", id: "mrk00001", patch: { position: [x, 0] } },
			]);
		}
		editor.endGroup();
		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
	});

	test("undoes a brush stroke painting over its own cells to the ink before it", () => {
		const editor = PlanEditor.create(typicalPlan());
		const inkBefore = editor.getDocument().ink;

		editor.beginGroup();
		editor.apply({
			type: "setInk",
			cells: [
				[0, 1],
				[1, 1],
			],
		});
		editor.apply({
			type: "setInk",
			cells: [
				[1, 2],
				[2, 2],
			],
		});
		editor.endGroup();
		editor.undo();

		expect(editor.getDocument().ink).toEqual(inkBefore);
	});

	test("clears the redo history on a new edit", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(moveFirstPlayer([1, 1]));
		editor.undo();
		editor.apply(moveFirstPlayer([2, 2]));

		expect(editor.canRedo()).toBe(false);
	});

	test("closes an open group when undoing", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.beginGroup();
		editor.apply(moveFirstPlayer([1, 1]));
		editor.undo();
		editor.endGroup();

		expect(editor.getDocument()).toEqual(typicalPlan());
		expect(editor.canRedo()).toBe(true);
	});

	test("records no step for operations that change nothing", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply({ type: "removeDrawing", id: "nope" });

		expect(editor.canUndo()).toBe(false);
	});

	test("keeps only the newest steps", () => {
		const editor = PlanEditor.create(typicalPlan());

		for (let x = 0; x <= PlanEditor.HISTORY_LIMIT; x++) {
			editor.apply(moveFirstPlayer([x, x]));
		}
		let undos = 0;
		while (editor.canUndo()) {
			editor.undo();
			undos++;
		}

		expect(undos).toBe(PlanEditor.HISTORY_LIMIT);
		expect(editor.getDocument().slots[0]?.position).toEqual([0, 0]);
	});

	test("records no step for an endGroup without a group or a group changing nothing", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.endGroup();
		editor.beginGroup();
		editor.apply({ type: "removeDrawing", id: "nope" });
		editor.endGroup();
		editor.apply(moveFirstPlayer([1, 1]));
		editor.undo();

		expect(editor.canUndo()).toBe(false);
	});

	test("updates the history before telling subscribers", () => {
		const editor = PlanEditor.create(typicalPlan());
		const seen: Array<{ canUndo: boolean; canRedo: boolean }> = [];
		editor.subscribe(() =>
			seen.push({ canUndo: editor.canUndo(), canRedo: editor.canRedo() }),
		);

		editor.apply(moveFirstPlayer([1, 1]));
		editor.undo();
		editor.redo();
		editor.undo();
		editor.apply(moveFirstPlayer([2, 2]));

		expect(seen).toEqual([
			{ canUndo: true, canRedo: false },
			{ canUndo: false, canRedo: true },
			{ canUndo: true, canRedo: false },
			{ canUndo: false, canRedo: true },
			{ canUndo: true, canRedo: false },
		]);
	});

	test("tells subscribers what was applied, undo included", () => {
		const editor = PlanEditor.create(typicalPlan());
		const listener = vi.fn();
		const unsubscribe = editor.subscribe(listener);

		editor.apply(moveFirstPlayer([1, 1]));
		editor.undo();
		unsubscribe();
		editor.redo();

		expect(listener).toHaveBeenCalledTimes(2);
		expect(listener.mock.calls[0][0].operations).toEqual([
			moveFirstPlayer([1, 1]),
		]);
		expect(listener.mock.calls[1][0].operations).toEqual([
			{
				type: "updatePlayer",
				slot: 0,
				patch: { position: typicalPlan().slots[0]?.position },
			},
		]);
		expect(listener.mock.calls[1][0].previous.slots[0].position).toEqual([
			1, 1,
		]);
	});
});
