import { describe, expect, test } from "vitest";
import * as FloatingLayer from "./floating-layer";

const BOUNDS: FloatingLayer.Bounds = {
	top: 0,
	right: 1000,
	bottom: 800,
	left: 0,
};
const VIEWPORT = { width: 1000, height: 800 };
const GAP = 8;
const PADDING = 12;

function anchorAt(top: number, left = 100): FloatingLayer.Rect {
	return { top, left, width: 200, height: 40 };
}

describe("FloatingLayer.resolve", () => {
	test.each([
		{
			why: "stays below when the content fits there",
			anchorTop: 100,
			height: 300,
			side: "bottom",
			availableHeight: 640,
		},
		{
			why: "flips above when the content does not fit below but has more room there",
			anchorTop: 700,
			height: 300,
			side: "top",
			availableHeight: 680,
		},
		{
			why: "takes the roomier side when the content fits on neither",
			anchorTop: 700,
			height: 900,
			side: "top",
			availableHeight: 680,
		},
		{
			why: "keeps the asked side when it is the roomier one though the content fits on neither",
			anchorTop: 100,
			height: 900,
			side: "bottom",
			availableHeight: 640,
		},
	])("$why", ({ anchorTop, height, side, availableHeight }) => {
		const resolution = FloatingLayer.resolve({
			anchor: anchorAt(anchorTop),
			floating: { width: 200, height },
			bounds: BOUNDS,
			placement: "bottom",
			gap: GAP,
			padding: PADDING,
			rtl: false,
		});

		expect(resolution.side).toBe(side);
		expect(resolution.availableHeight).toBe(availableHeight);
		expect(resolution.availableWidth).toBe(976);
	});

	test("keeps a sticky header at the top of the bounds out of the room above", () => {
		const resolution = FloatingLayer.resolve({
			anchor: anchorAt(300),
			floating: { width: 200, height: 250 },
			bounds: { ...BOUNDS, top: 55 },
			placement: "top",
			gap: GAP,
			padding: PADDING,
			rtl: false,
		});

		expect(resolution.side).toBe("bottom");
		expect(resolution.availableHeight).toBe(440);
	});

	test("puts a beside placement on the other side when the content has more room there", () => {
		const resolution = FloatingLayer.resolve({
			anchor: { top: 100, left: 800, width: 100, height: 40 },
			floating: { width: 200, height: 40 },
			bounds: BOUNDS,
			placement: "right",
			gap: GAP,
			padding: PADDING,
			rtl: false,
		});

		expect(resolution.side).toBe("left");
		expect(resolution.availableWidth).toBe(780);
		expect(resolution.availableHeight).toBe(776);
	});

	test.each([
		{ placement: "bottom", rtl: false, align: "center", origin: "50% 0%" },
		{ placement: "bottom start", rtl: false, align: "start", origin: "0% 0%" },
		{ placement: "bottom end", rtl: false, align: "end", origin: "100% 0%" },
		{ placement: "bottom end", rtl: true, align: "end", origin: "0% 0%" },
		{ placement: "top", rtl: false, align: "center", origin: "50% 100%" },
		{ placement: "right", rtl: false, align: "center", origin: "0% 50%" },
	] as const)(
		"$placement (rtl: $rtl) aligns $align with its origin at $origin",
		({ placement, rtl, align, origin }) => {
			const resolution = FloatingLayer.resolve({
				anchor: anchorAt(100, 400),
				floating: { width: 100, height: 50 },
				bounds: BOUNDS,
				placement,
				gap: GAP,
				padding: PADDING,
				rtl,
			});

			expect(resolution.align).toBe(align);
			expect(resolution.transformOrigin).toBe(origin);
		},
	);
});

describe("FloatingLayer.spaceAcross", () => {
	test.each([
		{ placement: "bottom", space: 976 },
		{ placement: "top", space: 976 },
		{ placement: "right", space: 776 },
	] as const)("$placement has $space across", ({ placement, space }) => {
		expect(FloatingLayer.spaceAcross(BOUNDS, placement, PADDING)).toBe(space);
	});
});

describe("FloatingLayer.isVerticalPlacement", () => {
	test.each([
		{ placement: "bottom start", vertical: true },
		{ placement: "top", vertical: true },
		{ placement: "right", vertical: false },
	] as const)("$placement -> $vertical", ({ placement, vertical }) => {
		expect(FloatingLayer.isVerticalPlacement(placement)).toBe(vertical);
	});
});

describe("FloatingLayer.insets", () => {
	const box = { width: 100, height: 50 };

	test.each([
		{
			why: "centers under the anchor",
			anchor: anchorAt(100),
			floating: box,
			side: "bottom",
			align: "center",
			rtl: false,
			expected: { top: 148, right: null, bottom: null, left: 150 },
		},
		{
			why: "hangs from the edge facing the anchor above it",
			anchor: anchorAt(100),
			floating: box,
			side: "top",
			align: "center",
			rtl: false,
			expected: { top: null, right: null, bottom: 708, left: 150 },
		},
		{
			why: "lines up with the start edge of the anchor",
			anchor: anchorAt(100),
			floating: box,
			side: "bottom",
			align: "start",
			rtl: false,
			expected: { top: 148, right: null, bottom: null, left: 100 },
		},
		{
			why: "lines up with the end edge of the anchor",
			anchor: anchorAt(100),
			floating: box,
			side: "bottom",
			align: "end",
			rtl: false,
			expected: { top: 148, right: null, bottom: null, left: 200 },
		},
		{
			why: "reads start as the right edge in rtl",
			anchor: anchorAt(100),
			floating: box,
			side: "bottom",
			align: "start",
			rtl: true,
			expected: { top: 148, right: null, bottom: null, left: 200 },
		},
		{
			why: "shifts back inside the bounds on the right",
			anchor: anchorAt(100, 900),
			floating: box,
			side: "bottom",
			align: "center",
			rtl: false,
			expected: { top: 148, right: null, bottom: null, left: 888 },
		},
		{
			why: "shifts back inside the bounds on the left",
			anchor: { top: 100, left: 0, width: 50, height: 40 },
			floating: box,
			side: "bottom",
			align: "center",
			rtl: false,
			expected: { top: 148, right: null, bottom: null, left: 12 },
		},
		{
			why: "sits at the padding when wider than the bounds",
			anchor: anchorAt(100),
			floating: { width: 1200, height: 50 },
			side: "bottom",
			align: "center",
			rtl: false,
			expected: { top: 148, right: null, bottom: null, left: 12 },
		},
		{
			why: "sits beside the anchor",
			anchor: { top: 300, left: 100, width: 100, height: 40 },
			floating: box,
			side: "right",
			align: "center",
			rtl: false,
			expected: { top: 295, right: null, bottom: null, left: 208 },
		},
		{
			why: "hangs from the edge facing the anchor on its left",
			anchor: { top: 300, left: 100, width: 100, height: 40 },
			floating: box,
			side: "left",
			align: "center",
			rtl: false,
			expected: { top: 295, right: 908, bottom: null, left: null },
		},
		{
			why: "shifts down inside the bounds beside a high anchor",
			anchor: { top: 10, left: 100, width: 100, height: 40 },
			floating: box,
			side: "right",
			align: "center",
			rtl: false,
			expected: { top: 12, right: null, bottom: null, left: 208 },
		},
	] as const)("$why", ({ anchor, floating, side, align, rtl, expected }) => {
		expect(
			FloatingLayer.insets({
				anchor,
				floating,
				bounds: BOUNDS,
				side,
				align,
				gap: GAP,
				padding: PADDING,
				rtl,
				viewport: VIEWPORT,
			}),
		).toEqual(expected);
	});
});

describe("FloatingLayer.documentInsets", () => {
	test.each([
		{
			why: "moves the near edges down the document by the scroll offset",
			insets: { top: 148, right: null, bottom: null, left: 150 },
			scroll: { x: 0, y: 300 },
			expected: { top: 448, right: null, bottom: null, left: 150 },
		},
		{
			why: "moves the far edges the other way",
			insets: { top: null, right: 908, bottom: 708, left: null },
			scroll: { x: 40, y: 300 },
			expected: { top: null, right: 868, bottom: 408, left: null },
		},
		{
			why: "leaves an unscrolled page as it is",
			insets: { top: 148, right: null, bottom: null, left: 150 },
			scroll: { x: 0, y: 0 },
			expected: { top: 148, right: null, bottom: null, left: 150 },
		},
	])("$why", ({ insets, scroll, expected }) => {
		expect(FloatingLayer.documentInsets(insets, scroll)).toEqual(expected);
	});
});
