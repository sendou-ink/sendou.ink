import { describe, expect, test } from "vitest";
import type { PlanDrawing, Point } from "./PlanDocument";
import * as PlanGeometry from "./PlanGeometry";

const BOX = { x: 100, y: 100, width: 100, height: 50 };

describe("PlanGeometry.polylineTouchesBox", () => {
	test.each<{ why: string; points: Point[]; expected: boolean }>([
		{ why: "a point inside", points: [[150, 120]], expected: true },
		{
			why: "a segment crossing it with both ends outside",
			points: [
				[50, 125],
				[250, 125],
			],
			expected: true,
		},
		{
			why: "a segment ending on its edge",
			points: [
				[50, 100],
				[100, 100],
			],
			expected: true,
		},
		{
			why: "a line passing above it",
			points: [
				[50, 80],
				[120, 80],
				[260, 95],
			],
			expected: false,
		},
		{
			why: "a closed outline around it",
			points: [
				[0, 0],
				[400, 0],
				[400, 400],
				[0, 400],
				[0, 0],
			],
			expected: false,
		},
		{ why: "no points", points: [], expected: false },
	])("$why: $expected", ({ points, expected }) => {
		expect(PlanGeometry.polylineTouchesBox(points, BOX)).toBe(expected);
	});
});

describe("PlanGeometry.deltaKeepingOnMap", () => {
	test.each<{ why: string; delta: Point; expected: Point }>([
		{ why: "a move within the map", delta: [100, -50], expected: [100, -50] },
		{ why: "past the left edge", delta: [-500, 0], expected: [-100, 0] },
		{ why: "past the bottom edge", delta: [0, 2000], expected: [0, 780] },
	])("shortens $why", ({ delta, expected }) => {
		const points: Point[] = [
			[100, 200],
			[400, 300],
		];

		expect(PlanGeometry.deltaKeepingOnMap(points, delta)).toEqual(expected);
	});

	test("lets points already off the map move back but not further away", () => {
		const points: Point[] = [[-20, 500]];

		expect(PlanGeometry.deltaKeepingOnMap(points, [-10, 0])).toEqual([0, 0]);
		expect(PlanGeometry.deltaKeepingOnMap(points, [30, 0])).toEqual([30, 0]);
	});
});

describe("PlanGeometry.outlineOf", () => {
	test("closes a rectangle's outline whichever corner it was drawn from", () => {
		const rectangle: PlanDrawing = {
			id: "r",
			type: "rectangle",
			color: "#ffffff",
			size: "M",
			from: [300, 200],
			to: [100, 50],
		};

		expect(PlanGeometry.outlineOf(rectangle)).toEqual([
			[100, 50],
			[300, 50],
			[300, 200],
			[100, 200],
			[100, 50],
		]);
	});

	test("goes around an ellipse within its box", () => {
		const outline = PlanGeometry.outlineOf({
			id: "e",
			type: "ellipse",
			color: "#ffffff",
			size: "M",
			from: [0, 0],
			to: [200, 100],
		})!;

		expect(outline[0]).toEqual([200, 50]);
		expect(outline.at(-1)![0]).toBeCloseTo(200);
		expect(
			PlanGeometry.polylineTouchesBox(outline, {
				x: 80,
				y: 40,
				width: 40,
				height: 20,
			}),
		).toBe(false);
		expect(
			PlanGeometry.polylineTouchesBox(outline, {
				x: 195,
				y: 45,
				width: 10,
				height: 10,
			}),
		).toBe(true);
	});

	test("leaves a text's extent to the renderer", () => {
		expect(
			PlanGeometry.outlineOf({
				id: "t",
				type: "text",
				color: "#ffffff",
				size: "M",
				position: [0, 0],
				text: "hi",
			}),
		).toBeNull();
	});
});
