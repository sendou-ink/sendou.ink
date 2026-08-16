import assert from "node:assert/strict";
import { loadOpenCV, minMaxLoc } from "../core/cv";
import test from "./node-test-compat";

test("opencv.js loads in Node and matchTemplate works", async () => {
	const cv = await loadOpenCV();

	// 20x20 gray canvas with a 5x5 white square at (10, 7)
	const scene = new cv.Mat(20, 20, cv.CV_8UC1, new cv.Scalar(64));
	const white = scene.roi(new cv.Rect(10, 7, 5, 5));
	white.setTo(new cv.Scalar(255));
	white.delete();

	// Template must have variance for TM_CCOEFF_NORMED: white square + gray border
	const patch = scene.roi(new cv.Rect(9, 6, 7, 7));
	const template = patch.clone();
	patch.delete();
	const result = new cv.Mat();
	cv.matchTemplate(scene, template, result, cv.TM_CCOEFF_NORMED);
	const { maxLoc, maxVal } = minMaxLoc(result);

	assert.equal(maxLoc.x, 9);
	assert.equal(maxLoc.y, 6);
	assert.ok(maxVal > 0.99, `expected strong peak, got ${maxVal}`);

	scene.delete();
	template.delete();
	result.delete();
});
