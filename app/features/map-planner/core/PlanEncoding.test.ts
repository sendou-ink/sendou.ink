import { describe, expect, test } from "vitest";
import { inkWithBlobs, typicalPlan } from "../tests/fixtures";
import * as PlanDocument from "./PlanDocument";
import * as PlanEncoding from "./PlanEncoding";

describe("PlanEncoding.encode", () => {
	test("round trips a plan through decode", () => {
		const plan = typicalPlan();

		expect(PlanEncoding.decode(PlanEncoding.encode(plan))).toEqual({
			ok: true,
			document: plan,
		});
	});

	test("round trips an empty plan", () => {
		const plan = PlanDocument.empty({ stageId: 7, mode: "TW" });
		plan.variant = "lowTide";
		plan.teams = [{ color: "#123456" }, { color: "#abcdef" }];

		expect(PlanEncoding.decode(PlanEncoding.encode(plan))).toEqual({
			ok: true,
			document: plan,
		});
	});

	test.each<PlanDocument.PlanObjective>([
		{ mode: "TW" },
		{ mode: "SZ", zones: { a: 0, b: 1 } },
		{ mode: "TC", clearedCheckpoints: ["cp1", "cp2"], tower: 0.25 },
		{ mode: "TC", clearedCheckpoints: [], tower: null },
		{ mode: "RM", clearedCheckpoints: ["cp1"], rainmaker: { carrier: 6 } },
		{ mode: "RM", clearedCheckpoints: [], rainmaker: { position: [100, 200] } },
		{ mode: "RM", clearedCheckpoints: [], rainmaker: null },
		{ mode: "CB", openBasket: 1 },
		{ mode: "CB", openBasket: null },
	])("round trips the objective state %o", (objective) => {
		const plan = {
			...PlanDocument.empty({ stageId: 3, mode: "TW" }),
			objective,
		};

		expect(PlanEncoding.decode(PlanEncoding.encode(plan))).toEqual({
			ok: true,
			document: plan,
		});
	});

	test("round trips a resized text, rounding its scale", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [
			{
				id: "text",
				type: "text",
				color: "#ffffff",
				size: "M",
				position: [10, 20],
				text: "push",
				scale: 1.5049,
			},
		];

		expect(decoded(PlanEncoding.encode(plan)).drawings[0]).toEqual({
			...plan.drawings[0],
			scale: 1.5,
		});
	});

	test("rounds coordinates to whole map pixels", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.slots[0] = {
			...PlanDocument.newPlayer(40),
			position: [100.4, 200.6],
		};

		expect(decoded(PlanEncoding.encode(plan)).slots[0]?.position).toEqual([
			100, 201,
		]);
	});

	test("simplifies strokes, keeping their shape", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.drawings = [
			{
				id: "s",
				type: "stroke",
				color: "#ffffff",
				size: "M",
				points: [
					[0, 0],
					[0, 0],
					...Array.from(
						{ length: 49 },
						(_, index) => [(index + 1) * 2, index + 1] as PlanDocument.Point,
					),
					[100, 100],
				],
			},
		];

		const stroke = decoded(PlanEncoding.encode(plan)).drawings[0];

		expect(stroke.type === "stroke" ? stroke.points : null).toEqual([
			[0, 0],
			[98, 49],
			[100, 100],
		]);
	});

	test("encodes an already encoded plan the same", () => {
		const plan = typicalPlan();
		plan.drawings.push({
			id: "dense",
			type: "stroke",
			color: "#ffffff",
			size: "M",
			points: Array.from({ length: 200 }, (_, index) => [
				index * 2.3,
				Math.sin(index / 10) * 80 + 500.2,
			]),
		});
		const once = PlanEncoding.encode(plan);

		expect(PlanEncoding.encode(decoded(once))).toBe(once);
	});

	test("cuts values past the format's limits so the plan still decodes", () => {
		const plan = typicalPlan();
		plan.slots[0] = { ...plan.slots[0]!, label: "a".repeat(40) };
		plan.teams = [{ color: "#FFAA00" }, { color: "red" }];
		plan.objective = { mode: "TC", clearedCheckpoints: [""], tower: 1.5 };
		plan.markers = Array.from({ length: 250 }, (_, index) => ({
			id: `m${index}`,
			kind: "sub" as const,
			owner: 0 as const,
			position: [index, index] as PlanDocument.Point,
		}));
		plan.drawings = [
			{
				id: "text",
				type: "text",
				color: "#ABCDEF",
				size: "M",
				position: [0, 0],
				text: "x".repeat(500),
			},
			{ id: "empty", type: "stroke", color: "#ffffff", size: "M", points: [] },
			{
				id: "long",
				type: "stroke",
				color: "#ffffff",
				size: "M",
				points: Array.from({ length: 6000 }, (_, index) => [
					index,
					index % 2 === 0 ? 0 : 20,
				]),
			},
		];

		const document = decoded(PlanEncoding.encode(plan));

		expect(document.slots[0]?.label).toHaveLength(
			PlanDocument.PLAYER_LABEL_MAX_LENGTH,
		);
		expect(document.teams).toEqual([
			{ color: "#ffaa00" },
			{ color: PlanDocument.DEFAULT_TEAM_COLORS[1] },
		]);
		expect(document.objective).toEqual({
			mode: "TC",
			clearedCheckpoints: [],
			tower: 1,
		});
		expect(document.markers).toHaveLength(200);
		expect(document.drawings.map((drawing) => drawing.id)).toEqual([
			"text",
			"long",
		]);
		expect(document.drawings[0]).toMatchObject({
			color: "#abcdef",
			text: "x".repeat(PlanDocument.DRAWING_TEXT_MAX_LENGTH),
		});
		expect(
			document.drawings[1].type === "stroke"
				? document.drawings[1].points.length
				: null,
		).toBe(5000);
	});

	test("keeps a typical plan small", () => {
		const plan = typicalPlan();

		expect(PlanEncoding.encode(plan).length).toBe(2610);
		expect(PlanEncoding.toUrlParam(plan).length).toBe(1580);
	});

	test("keeps a map fully painted in blobs small", () => {
		const plan = PlanDocument.empty({ stageId: 0, mode: "SZ" });
		plan.ink = inkWithBlobs([
			{ center: [960, 540], radius: 2000, value: 1 },
			{ center: [1300, 540], radius: 400, value: 2 },
			{ center: [600, 300], radius: 150, value: 0 },
		]);

		expect(PlanEncoding.encode(plan).length).toBe(330);
	});
});

describe("PlanEncoding.decode", () => {
	test("rejects a plan of an unknown version", () => {
		const stored = JSON.parse(PlanEncoding.encode(typicalPlan()));
		stored.v = PlanEncoding.PLAN_FORMAT_VERSION + 1;

		expect(PlanEncoding.decode(JSON.stringify(stored))).toEqual({
			ok: false,
			error: "unsupportedVersion",
		});
	});

	test.each([
		{ why: "not JSON", text: "{" },
		{ why: "not an object", text: "[1, 2]" },
		{
			why: "an old tldraw file",
			text: JSON.stringify({
				tldrawFileFormatVersion: 1,
				schema: {},
				records: [],
			}),
		},
		{
			why: "unknown weapon",
			text: withStored((stored) => {
				stored.p[0].w = 9999;
			}),
		},
		{
			why: "seven slots",
			text: withStored((stored) => stored.p.pop()),
		},
		{
			why: "duplicate drawing ids",
			text: withStored((stored) => stored.d.push(stored.d[0])),
		},
		{
			why: "objective state of another mode",
			text: withStored((stored) => {
				stored.o = { t: 0.5 };
			}),
		},
		{
			why: "ink runs longer than the grid",
			text: withStored((stored) => {
				stored.i = "Azzzz";
			}),
		},
		{
			why: "ink with an unknown value",
			text: withStored((stored) => {
				stored.i = "C4";
			}),
		},
		{
			why: "a stroke with half a point",
			text: withStored((stored) => stored.d[0].p.push(5)),
		},
	])("rejects $why", ({ text }) => {
		expect(PlanEncoding.decode(text)).toEqual({ ok: false, error: "invalid" });
	});
});

describe("PlanEncoding.toUrlParam", () => {
	test("round trips a plan through fromUrlParam in URL-safe characters", () => {
		const plan = typicalPlan();
		const param = PlanEncoding.toUrlParam(plan);

		expect(param).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(PlanEncoding.fromUrlParam(param)).toEqual({
			ok: true,
			document: plan,
		});
	});
});

describe("PlanEncoding.fromUrlParam", () => {
	test.each([
		"",
		"not-a-plan",
		PlanEncoding.toUrlParam(typicalPlan()).slice(0, 50),
	])("rejects a corrupt parameter: %s", (param) => {
		expect(PlanEncoding.fromUrlParam(param)).toEqual({
			ok: false,
			error: "invalid",
		});
	});
});

function decoded(text: string) {
	const result = PlanEncoding.decode(text);
	if (!result.ok) throw new Error(`Could not decode: ${result.error}`);

	return result.document;
}

function withStored(edit: (stored: any) => void) {
	const stored = JSON.parse(PlanEncoding.encode(typicalPlan()));
	edit(stored);

	return JSON.stringify(stored);
}
