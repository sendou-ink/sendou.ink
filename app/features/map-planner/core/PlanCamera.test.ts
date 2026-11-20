import { describe, expect, test } from "vitest";
import * as PlanCamera from "./PlanCamera";

const WIDE = { width: 1000, height: 400 };
const TALL = { width: 960, height: 1000 };

describe("PlanCamera.fit", () => {
	test.each([
		{
			why: "wider than the map, centered horizontally",
			viewport: WIDE,
			expected: {
				scale: 400 / 1080,
				x: (1000 - 1920 * (400 / 1080)) / 2,
				y: 0,
			},
		},
		{
			why: "taller than the map, centered vertically",
			viewport: TALL,
			expected: { scale: 0.5, x: 0, y: (1000 - 540) / 2 },
		},
	])("$why", ({ viewport, expected }) => {
		const camera = PlanCamera.fit(viewport);

		expect(camera.scale).toBeCloseTo(expected.scale);
		expect(camera.x).toBeCloseTo(expected.x);
		expect(camera.y).toBeCloseTo(expected.y);
	});
});

describe("PlanCamera.clamp", () => {
	test("doesn't zoom out past fitting the map", () => {
		expect(PlanCamera.clamp({ scale: 0.1, x: 0, y: 0 }, TALL).scale).toBe(0.5);
	});

	test("doesn't zoom in past the zoom limit", () => {
		expect(PlanCamera.clamp({ scale: 100, x: 0, y: 0 }, TALL).scale).toBe(
			0.5 * PlanCamera.MAX_ZOOM,
		);
	});

	test.each([
		{ why: "left edge", x: 50, expectedX: 0 },
		{ why: "right edge", x: -5000, expectedX: 960 - 1920 },
		{ why: "inside", x: -300, expectedX: -300 },
	])("keeps the $why of the map in view", ({ x, expectedX }) => {
		expect(PlanCamera.clamp({ scale: 1, x, y: 0 }, TALL).x).toBe(expectedX);
	});

	test.each([
		{ why: "top edge", y: 50, expectedY: 0 },
		{ why: "bottom edge", y: -5000, expectedY: 400 - 1080 },
		{ why: "inside", y: -300, expectedY: -300 },
	])("keeps the $why of the map in view vertically", ({ y, expectedY }) => {
		expect(PlanCamera.clamp({ scale: 1, x: 0, y }, WIDE).y).toBe(expectedY);
	});
});

describe("PlanCamera.zoomAt", () => {
	test("keeps the map point under the anchor in place", () => {
		const camera = { scale: 1, x: -400, y: -200 };
		const anchor: [number, number] = [300, 500];

		const zoomed = PlanCamera.zoomAt(camera, TALL, anchor, 1.5);

		const [mapX, mapY] = PlanCamera.toMap(camera, anchor);
		expect(zoomed.scale).toBe(1.5);
		expect(mapX * zoomed.scale + zoomed.x).toBeCloseTo(anchor[0]);
		expect(mapY * zoomed.scale + zoomed.y).toBeCloseTo(anchor[1]);
	});

	test.each([
		{
			why: "in to the zoom limit",
			factor: 100,
			expectedScale: 0.5 * PlanCamera.MAX_ZOOM,
		},
		{ why: "out to fitting the map", factor: 0.01, expectedScale: 0.5 },
	])("stops zooming $why", ({ factor, expectedScale }) => {
		const zoomed = PlanCamera.zoomAt(
			{ scale: 1, x: -400, y: -40 },
			TALL,
			[300, 500],
			factor,
		);

		expect(zoomed.scale).toBe(expectedScale);
	});

	test("zooming in past the limit keeps the map point under the anchor in place", () => {
		const camera = { scale: 1, x: -400, y: -200 };
		const anchor: [number, number] = [300, 500];

		const zoomed = PlanCamera.zoomAt(camera, TALL, anchor, 100);

		const [mapX, mapY] = PlanCamera.toMap(camera, anchor);
		expect(mapX * zoomed.scale + zoomed.x).toBeCloseTo(anchor[0]);
		expect(mapY * zoomed.scale + zoomed.y).toBeCloseTo(anchor[1]);
	});

	test("zooming in at the limit leaves the camera where it is", () => {
		const atLimit = PlanCamera.zoomAt(
			{ scale: 1, x: -400, y: -200 },
			TALL,
			[300, 500],
			100,
		);

		expect(PlanCamera.zoomAt(atLimit, TALL, [600, 200], 1.2)).toEqual(atLimit);
	});

	test("zooming out to fitting the map centers it", () => {
		expect(
			PlanCamera.zoomAt({ scale: 1, x: -400, y: -40 }, TALL, [300, 500], 0.01),
		).toEqual(PlanCamera.fit(TALL));
	});
});

describe("PlanCamera.panBy", () => {
	test("can't move a fitted map", () => {
		const fitted = PlanCamera.fit(TALL);

		expect(PlanCamera.panBy(fitted, TALL, [200, -200])).toEqual(fitted);
	});

	test("moves a zoomed map along with the pointer", () => {
		expect(
			PlanCamera.panBy({ scale: 1, x: -300, y: -200 }, WIDE, [50, -30]),
		).toEqual({ scale: 1, x: -250, y: -230 });
	});

	test("stops a zoomed map at its edges", () => {
		expect(
			PlanCamera.panBy({ scale: 1, x: -300, y: -200 }, WIDE, [500, -900]),
		).toEqual({ scale: 1, x: 0, y: 400 - 1080 });
	});
});

describe("PlanCamera.centerOn", () => {
	test("puts the point in the middle of the viewport", () => {
		const camera = PlanCamera.centerOn(
			{ scale: 1, x: 0, y: 0 },
			WIDE,
			[960, 540],
		);

		expect(PlanCamera.toMap(camera, [WIDE.width / 2, WIDE.height / 2])).toEqual(
			[960, 540],
		);
	});

	test("keeps the zoom", () => {
		expect(
			PlanCamera.centerOn({ scale: 1.2, x: 0, y: 0 }, WIDE, [960, 540]).scale,
		).toBe(1.2);
	});

	test("stops at the map's edges for a point near a corner", () => {
		expect(
			PlanCamera.centerOn({ scale: 1, x: -300, y: -200 }, WIDE, [10, 10]),
		).toEqual({ scale: 1, x: 0, y: 0 });
	});
});

describe("PlanCamera.isFitted", () => {
	test.each([
		{ why: "fitted", camera: PlanCamera.fit(TALL), expected: true },
		{ why: "zoomed in", camera: { scale: 1, x: 0, y: 0 }, expected: false },
	])("$why", ({ camera, expected }) => {
		expect(PlanCamera.isFitted(camera, TALL)).toBe(expected);
	});
});
