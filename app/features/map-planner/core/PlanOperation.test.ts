import { describe, expect, test } from "vitest";
import { typicalPlan } from "../tests/fixtures";
import * as PlanDocument from "./PlanDocument";
import * as PlanOperation from "./PlanOperation";

const plan = typicalPlan();

describe("PlanOperation.apply", () => {
	test.each<{ why: string; operation: PlanOperation.PlanOperation }>([
		{
			why: "board",
			operation: {
				type: "updateBoard",
				patch: { stageId: 7, variant: "lowTide" },
			},
		},
		{
			why: "team",
			operation: { type: "updateTeam", team: 1, patch: { color: "#00ff00" } },
		},
		{
			why: "emptying a slot",
			operation: { type: "setPlayer", slot: 3, player: null },
		},
		{
			why: "replacing a player",
			operation: {
				type: "setPlayer",
				slot: 2,
				player: PlanDocument.newPlayer(50),
			},
		},
		{
			why: "player",
			operation: {
				type: "updatePlayer",
				slot: 1,
				patch: { status: "jumping", position: [10, 20], label: "x" },
			},
		},
		{
			why: "adding a marker",
			operation: {
				type: "addMarker",
				marker: { id: "new", kind: "sub", owner: 1, position: [1, 2] },
			},
		},
		{
			why: "removing a marker",
			operation: { type: "removeMarker", id: "mrk00002" },
		},
		{
			why: "marker",
			operation: {
				type: "updateMarker",
				id: "mrk00001",
				patch: { position: [5, 5] },
			},
		},
		{
			why: "adding a drawing",
			operation: {
				type: "addDrawing",
				drawing: {
					id: "new",
					type: "line",
					color: "#ffffff",
					size: "S",
					from: [0, 0],
					to: [10, 10],
				},
			},
		},
		{
			why: "removing a drawing from the middle",
			operation: { type: "removeDrawing", id: "stroke03" },
		},
		{
			why: "drawing",
			operation: {
				type: "updateDrawing",
				id: "text0001",
				patch: { text: "rotate", color: "#000000" },
			},
		},
		{
			why: "ink, a cell set twice",
			operation: {
				type: "setInk",
				cells: [
					[0, 1],
					[1, 2],
					[0, 2],
				],
			},
		},
		{
			why: "objective",
			operation: {
				type: "updateObjective",
				patch: { mode: "SZ", zones: { "0": 1, "1": 0 } },
			},
		},
		{
			why: "switching the mode",
			operation: {
				type: "setObjective",
				objective: PlanDocument.emptyObjective("TC"),
			},
		},
	])("its inverse restores the plan: $why", ({ operation }) => {
		const result = PlanOperation.apply(plan, operation);

		expect(result.document).not.toEqual(plan);
		expect(result.inverse).not.toBeNull();
		expect(
			PlanOperation.apply(result.document, result.inverse!).document,
		).toEqual(plan);
	});

	test.each<{ why: string; operation: PlanOperation.PlanOperation }>([
		{
			why: "a drawing moved to where it is",
			operation: {
				type: "updateDrawing",
				id: "rect0001",
				patch: { from: [880, 420], to: [1040, 560] },
			},
		},
		{
			why: "a player given its status",
			operation: { type: "updatePlayer", slot: 6, patch: { status: "dead" } },
		},
		{
			why: "a marker moved to where it is",
			operation: {
				type: "updateMarker",
				id: "mrk00001",
				patch: { position: [520, 410] },
			},
		},
		{
			why: "the board given its stage",
			operation: { type: "updateBoard", patch: { stageId: 9 } },
		},
	])("changes nothing and has no inverse for $why", ({ operation }) => {
		const result = PlanOperation.apply(plan, operation);

		expect(result.document).toBe(plan);
		expect(result.inverse).toBeNull();
	});

	test("does not mutate the plan it is given", () => {
		const before = structuredClone(plan);

		PlanOperation.apply(plan, {
			type: "updatePlayer",
			slot: 0,
			patch: { position: [1, 1] },
		});
		PlanOperation.apply(plan, { type: "setInk", cells: [[5, 2]] });

		expect(plan).toEqual(before);
	});

	test("puts a removed drawing back where it was when undone", () => {
		const removed = PlanOperation.apply(plan, {
			type: "removeDrawing",
			id: "stroke02",
		});
		const restored = PlanOperation.apply(removed.document, removed.inverse!);

		expect(restored.document.drawings.map((drawing) => drawing.id)).toEqual(
			plan.drawings.map((drawing) => drawing.id),
		);
	});

	test.each<{ why: string; operation: PlanOperation.PlanOperation }>([
		{
			why: "updating the objective of a mode no longer played",
			operation: {
				type: "updateObjective",
				patch: { mode: "CB", openBasket: 0 },
			},
		},
		{
			why: "updating an empty slot",
			operation: { type: "updatePlayer", slot: 3, patch: { label: "x" } },
		},
		{
			why: "removing an unknown drawing",
			operation: { type: "removeDrawing", id: "nope" },
		},
		{
			why: "updating an unknown marker",
			operation: {
				type: "updateMarker",
				id: "nope",
				patch: { position: [0, 0] },
			},
		},
		{
			why: "adding a drawing id twice",
			operation: { type: "addDrawing", drawing: plan.drawings[0] },
		},
		{
			why: "ink outside the grid",
			operation: {
				type: "setInk",
				cells: [
					[-1, 1],
					[PlanDocument.INK_GRID.columns * PlanDocument.INK_GRID.rows, 1],
				],
			},
		},
	])("changes nothing and has no inverse: $why", ({ operation }) => {
		const withEmptySlot = { ...plan, slots: plan.slots.with(3, null) };

		const result = PlanOperation.apply(withEmptySlot, operation);

		expect(result.document).toBe(withEmptySlot);
		expect(result.inverse).toBeNull();
	});
});
