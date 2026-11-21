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

describe("PlanCommands.replacePlan", () => {
	const otherPlan = () => {
		const plan = typicalPlan();
		plan.stageId = 3;
		plan.variant = undefined;
		plan.teams[1] = { color: "#ff00ff" };
		plan.slots[0] = null;
		plan.slots[1] = { ...plan.slots[1]!, status: "dead" };
		plan.markers = [plan.markers[2], plan.markers[0]];
		plan.drawings = plan.drawings.slice(4, 8);
		plan.ink = plan.ink.map((cell, index) => (index < 300 ? 2 : cell));
		plan.objective = { mode: "CB", openBasket: 1 };
		return plan;
	};

	test("turns the plan into the other one", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.replacePlan(editor.getDocument(), otherPlan()));

		expect(editor.getDocument()).toEqual(otherPlan());
	});

	test("is undone in one step", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.replacePlan(editor.getDocument(), otherPlan()));
		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
		expect(editor.canUndo()).toBe(false);
	});

	test("replaces a plan with markers and drawings of the same ids", () => {
		const editor = PlanEditor.create(
			PlanDocument.empty({ stageId: 0, mode: "SZ" }),
		);
		editor.apply(PlanCommands.replacePlan(editor.getDocument(), typicalPlan()));
		const moved = typicalPlan();
		moved.markers[0] = { ...moved.markers[0], position: [10, 10] };

		editor.apply(PlanCommands.replacePlan(editor.getDocument(), moved));

		expect(editor.getDocument()).toEqual(moved);
	});

	test("is nothing for the same plan", () => {
		expect(PlanCommands.replacePlan(typicalPlan(), typicalPlan())).toEqual([]);
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

describe("PlanCommands.setStatus", () => {
	test("puts the player in the status", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.setStatus(editor.getDocument(), 2, "sharking"));

		expect(editor.getDocument().slots[2]?.status).toBe("sharking");
	});

	test("ends the special but leaves its marker where it was placed", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.setStatus(editor.getDocument(), 5, "dead"));

		expect(editor.getDocument().slots[5]).toMatchObject({
			status: "dead",
			specialActive: false,
		});
		expect(editor.getDocument().markers).toEqual(typicalPlan().markers);
	});

	test("changes nothing for the status the player is in", () => {
		expect(PlanCommands.setStatus(typicalPlan(), 6, "dead")).toEqual([]);
	});
});

describe("PlanCommands.toggleSpecial", () => {
	test("a placed special drops its marker next to the token", () => {
		// Splat Roller: Big Bubbler
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.toggleSpecial(editor.getDocument(), 1));

		expect(editor.getDocument().slots[1]?.specialActive).toBe(true);
		const marker = editor.getDocument().markers.at(-1);
		expect(marker).toMatchObject({ kind: "special", owner: 1 });
		expect(
			distance(marker!.position, editor.getDocument().slots[1]!.position!),
		).toBeCloseTo(70, 0);
	});

	test("a special used where the player is drops no marker", () => {
		// Splattershot: Trizooka
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.toggleSpecial(editor.getDocument(), 0));

		expect(editor.getDocument().slots[0]?.specialActive).toBe(true);
		expect(editor.getDocument().markers).toEqual(typicalPlan().markers);
	});

	test("brings a dead player back to normal", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.toggleSpecial(editor.getDocument(), 6));

		expect(editor.getDocument().slots[6]).toMatchObject({
			status: "normal",
			specialActive: true,
		});
	});

	test("starting the special again keeps the marker left behind instead of dropping a second", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.setStatus(editor.getDocument(), 5, "dead"));
		editor.apply(PlanCommands.toggleSpecial(editor.getDocument(), 5));

		expect(editor.getDocument().slots[5]?.specialActive).toBe(true);
		expect(editor.getDocument().markers).toEqual(typicalPlan().markers);
	});

	test("ending the special leaves the player's thrown subs", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.throwSub(editor.getDocument(), 5));
		editor.apply(PlanCommands.toggleSpecial(editor.getDocument(), 5));

		expect(
			editor
				.getDocument()
				.markers.filter((marker) => marker.owner === 5)
				.map((marker) => marker.kind),
		).toEqual(["sub"]);
	});

	test("ending the special removes its marker", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.toggleSpecial(editor.getDocument(), 5));

		expect(editor.getDocument().slots[5]?.specialActive).toBe(false);
		expect(
			editor.getDocument().markers.some((marker) => marker.owner === 5),
		).toBe(false);
	});

	test("is undone in one step", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.toggleSpecial(editor.getDocument(), 1));
		editor.undo();

		expect(editor.getDocument()).toEqual(typicalPlan());
	});
});

describe("PlanCommands.throwSub", () => {
	test("drops sub markers around the token, each a step further round", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.throwSub(editor.getDocument(), 2));
		editor.apply(PlanCommands.throwSub(editor.getDocument(), 2));

		const subs = editor
			.getDocument()
			.markers.filter((marker) => marker.owner === 2);
		expect(subs).toHaveLength(2);
		expect(subs.every((marker) => marker.kind === "sub")).toBe(true);
		expect(subs[0].position).not.toEqual(subs[1].position);
	});

	test("throws towards the enemy's side first", () => {
		const plan = typicalPlan();

		const [teamA] = PlanCommands.throwSub(plan, 2);
		const [teamB] = PlanCommands.throwSub(plan, 7);

		expect(teamA).toMatchObject({
			type: "addMarker",
			marker: {
				position: [
					plan.slots[2]!.position![0] + 70,
					plan.slots[2]!.position![1],
				],
			},
		});
		expect(teamB).toMatchObject({
			type: "addMarker",
			marker: {
				position: [
					plan.slots[7]!.position![0] - 70,
					plan.slots[7]!.position![1],
				],
			},
		});
	});

	test("changes nothing while the token is off the map", () => {
		const plan = typicalPlan();
		plan.slots[2] = { ...plan.slots[2]!, hidden: true };

		expect(PlanCommands.throwSub(plan, 2)).toEqual([]);
	});
});

describe("PlanCommands.switchKit", () => {
	test("switches to the next kit, ending the special and dropping the old kit's markers", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.switchKit(editor.getDocument(), 5));

		expect(editor.getDocument().slots[5]).toMatchObject({
			weaponId: 311,
			specialActive: false,
		});
		expect(
			editor.getDocument().markers.some((marker) => marker.owner === 5),
		).toBe(false);
	});
});

describe("PlanCommands.toggleHidden", () => {
	test("takes a token off the map and puts it back where it was", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(PlanCommands.toggleHidden(editor.getDocument(), 3));
		expect(editor.getDocument().slots[3]?.hidden).toBe(true);
		expect(PlanCommands.isOnMap(editor.getDocument(), 3)).toBe(false);

		editor.apply(PlanCommands.toggleHidden(editor.getDocument(), 3));
		expect(editor.getDocument()).toEqual(typicalPlan());
	});
});

describe("PlanCommands.moveMarker", () => {
	test("moves the marker, kept on the map", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(
			PlanCommands.moveMarker(editor.getDocument(), "mrk00001", [-40, 300.4]),
		);

		expect(editor.getDocument().markers[0].position).toEqual([0, 300]);
	});

	test("changes nothing for a removed marker", () => {
		expect(PlanCommands.moveMarker(typicalPlan(), "gone", [10, 10])).toEqual(
			[],
		);
	});
});

describe("PlanCommands.moveDrawings", () => {
	test("moves every drawing by the same delta from where they were", () => {
		const editor = PlanEditor.create(typicalPlan());
		const originals = editor
			.getDocument()
			.drawings.filter((drawing) =>
				["rect0001", "text0001"].includes(drawing.id),
			);

		editor.apply(PlanCommands.moveDrawings(originals, [10.4, -20]));
		editor.apply(PlanCommands.moveDrawings(originals, [30, 40]));

		const moved = editor
			.getDocument()
			.drawings.filter((drawing) => originals.includes(drawing) === false)
			.filter((drawing) => ["rect0001", "text0001"].includes(drawing.id));
		expect(moved).toMatchObject([
			{ from: [910, 460], to: [1070, 600] },
			{ position: [930, 420] },
		]);
	});

	test("a move the map's edge stops entirely leaves no undo step", () => {
		const plan = typicalPlan();
		const editor = PlanEditor.create(plan);
		const originals = plan.drawings.filter(
			(drawing) => drawing.id === "rect0001",
		);
		editor.apply(PlanCommands.moveDrawings(originals, [0, -1000]));
		const atEdge = editor.getDocument();
		const undoneOnce = () => {
			editor.undo();
			return editor.getDocument();
		};

		editor.beginGroup();
		editor.apply(
			PlanCommands.moveDrawings(
				atEdge.drawings.filter((drawing) => drawing.id === "rect0001"),
				[0, -50],
			),
		);
		editor.endGroup();

		expect(editor.getDocument()).toBe(atEdge);
		expect(undoneOnce()).toEqual(plan);
	});

	test("stops the drawings at the map's edge, keeping their arrangement", () => {
		const plan = typicalPlan();
		const originals = plan.drawings.filter((drawing) =>
			["rect0001", "text0001"].includes(drawing.id),
		);

		const operations = PlanCommands.moveDrawings(originals, [0, -1000]);

		expect(operations).toEqual([
			{
				type: "updateDrawing",
				id: "rect0001",
				patch: { from: [880, 40], to: [1040, 180] },
			},
			{ type: "updateDrawing", id: "text0001", patch: { position: [900, 0] } },
		]);
	});
});

describe("PlanCommands.reorderDrawings", () => {
	const idsOf = (document: PlanDocument.PlanDocument) =>
		document.drawings.map((drawing) => drawing.id);
	const plan = () => ({
		...PlanDocument.empty({ stageId: 0, mode: "SZ" }),
		drawings: ["a", "b", "c", "d"].map(
			(id): PlanDocument.PlanDrawing => ({
				id,
				type: "line",
				color: "#ffffff",
				size: "M",
				from: [0, 0],
				to: [10, 10],
			}),
		),
	});

	test.each([
		{ ids: ["b"], place: "front" as const, expected: ["a", "c", "d", "b"] },
		{ ids: ["c"], place: "back" as const, expected: ["c", "a", "b", "d"] },
		{
			ids: ["c", "a"],
			place: "front" as const,
			expected: ["b", "d", "a", "c"],
		},
		{
			ids: ["d", "b"],
			place: "back" as const,
			expected: ["b", "d", "a", "c"],
		},
	])(
		"$place $ids → $expected, undone in one step",
		({ ids, place, expected }) => {
			const editor = PlanEditor.create(plan());

			editor.apply(
				PlanCommands.reorderDrawings(editor.getDocument(), ids, place),
			);
			expect(idsOf(editor.getDocument())).toEqual(expected);

			editor.undo();
			expect(editor.getDocument()).toEqual(plan());
		},
	);

	test.each([
		{ ids: ["c", "d"], place: "front" as const },
		{ ids: ["a"], place: "back" as const },
		{ ids: ["gone"], place: "front" as const },
	])(
		"changes nothing when $ids already are at the $place",
		({ ids, place }) => {
			expect(PlanCommands.reorderDrawings(plan(), ids, place)).toEqual([]);
		},
	);
});

describe("PlanCommands.styleDrawings", () => {
	test("restyles only the drawings that differ", () => {
		const plan = typicalPlan();

		expect(
			PlanCommands.styleDrawings(plan, ["rect0001", "arrow000", "gone"], {
				color: "#ffffff",
				size: "S",
			}),
		).toEqual([
			{
				type: "updateDrawing",
				id: "arrow000",
				patch: { color: "#ffffff", size: "S" },
			},
		]);
	});
});

describe("PlanCommands.removeDrawings", () => {
	test("removes the drawings as one undo step", () => {
		const editor = PlanEditor.create(typicalPlan());

		editor.apply(
			PlanCommands.removeDrawings(editor.getDocument(), [
				"rect0001",
				"text0001",
				"gone",
			]),
		);
		expect(
			editor.getDocument().drawings.map((drawing) => drawing.id),
		).not.toContain("rect0001");

		editor.undo();
		expect(editor.getDocument()).toEqual(typicalPlan());
	});
});

describe("PlanCommands.setText", () => {
	test("sets the text of a label", () => {
		expect(PlanCommands.setText(typicalPlan(), "text0001", "go")).toEqual([
			{ type: "updateDrawing", id: "text0001", patch: { text: "go" } },
		]);
	});

	test("removes a label left blank", () => {
		expect(PlanCommands.setText(typicalPlan(), "text0001", "  ")).toEqual([
			{ type: "removeDrawing", id: "text0001" },
		]);
	});

	test("changes nothing for the same text or a drawing that isn't a label", () => {
		const plan = typicalPlan();

		expect(
			PlanCommands.setText(plan, "text0001", "push left after the wipe"),
		).toEqual([]);
		expect(PlanCommands.setText(plan, "rect0001", "x")).toEqual([]);
	});
});

describe("PlanCommands.resizeShape", () => {
	test("spans the shape over the box, kept on the map", () => {
		expect(
			PlanCommands.resizeShape(typicalPlan(), "rect0001", {
				x: -10.2,
				y: 20.6,
				width: 100,
				height: 50,
			}),
		).toEqual([
			{
				type: "updateDrawing",
				id: "rect0001",
				patch: { from: [0, 21], to: [90, 71] },
			},
		]);
	});

	test("changes nothing for a drawing that isn't a rectangle or an ellipse", () => {
		expect(
			PlanCommands.resizeShape(typicalPlan(), "arrow000", {
				x: 0,
				y: 0,
				width: 10,
				height: 10,
			}),
		).toEqual([]);
	});
});

describe("PlanCommands.scaleText", () => {
	test.each([
		{ scale: 2, expected: 2 },
		{ scale: 0.01, expected: PlanDocument.TEXT_SCALE_LIMITS.min },
		{ scale: 100, expected: PlanDocument.TEXT_SCALE_LIMITS.max },
	])("scales a label by $scale to $expected", ({ scale, expected }) => {
		expect(
			PlanCommands.scaleText(typicalPlan(), "text0001", {
				position: [10, 20],
				scale,
			}),
		).toEqual([
			{
				type: "updateDrawing",
				id: "text0001",
				patch: { position: [10, 20], scale: expected },
			},
		]);
	});
});

function distance([ax, ay]: PlanDocument.Point, [bx, by]: PlanDocument.Point) {
	return Math.hypot(ax - bx, ay - by);
}
