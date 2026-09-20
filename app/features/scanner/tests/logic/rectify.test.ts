/**
 * Tests for the plane rectification math: a quad's homography lands its
 * corners, inverts back, and boxes a ROI's projection.
 */

import assert from "node:assert/strict";
import {
	homographyFromQuad,
	invertHomography,
	type PerspectiveQuad,
	projectedBounds,
	projectPoint,
} from "../../core/rectify";
import { test } from "../node-test-compat";

/** The quick battle log's card: its right side drawn taller than its left. */
const yawed: PerspectiveQuad = {
	from: [
		[1240, 408],
		[1605, 406],
		[1240, 995],
		[1605, 1008],
	],
	to: [
		[1240, 408],
		[1605, 408],
		[1240, 996],
		[1605, 996],
	],
};

const rounded = ([x, y]: readonly [number, number]) => [
	Math.round(x * 1000) / 1000,
	Math.round(y * 1000) / 1000,
];

test("maps every source corner onto its target", () => {
	const h = homographyFromQuad(yawed);
	for (const [i, from] of yawed.from.entries()) {
		assert.deepEqual(rounded(projectPoint(h, from)), yawed.to[i]);
	}
});

test("an unmoved quad gives the identity", () => {
	const h = homographyFromQuad({ from: yawed.to, to: yawed.to });
	const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];
	assert.ok(
		h.every((v, i) => Math.abs(v - identity[i]!) < 1e-9),
		`not the identity: ${h.join(", ")}`,
	);
});

test("the inverse maps targets back onto their sources", () => {
	const inverse = invertHomography(homographyFromQuad(yawed));
	for (const [i, to] of yawed.to.entries()) {
		assert.deepEqual(rounded(projectPoint(inverse, to)), yawed.from[i]);
	}
});

test("projectedBounds boxes the projected corners outward", () => {
	const inverse = invertHomography(homographyFromQuad(yawed));
	const box = projectedBounds(inverse, { x: 1240, y: 408, w: 365, h: 588 });
	assert.deepEqual(box, { x: 1240, y: 406, w: 365, h: 603 });
});
