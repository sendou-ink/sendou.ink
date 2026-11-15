/**
 * Every gate decides from its declared `gateRois` alone: on each fixture
 * frame with every other pixel replaced by noise, a gate failing on the
 * whole frame fails with the same result, and a gate passing on it passes
 * (the VoD scan then runs it again on the whole frame).
 */

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { createAllDetectors } from "../core/detectors/registry";
import * as GateRois from "../core/gate-rois";
import { type Image, imageFromFrameData, normalizeFrame } from "../core/image";
import { FIXTURES_DIR, loadFixtures } from "../node/fixtures";
import { readImage } from "../node/image-io";
import { loadScoreboardResources } from "../node/resources";
import { test } from "./node-test-compat";

const resources = await loadScoreboardResources();
const detectors = createAllDetectors(resources);
const spans = GateRois.spansOf(detectors.flatMap((d) => d.gateRois));
const fixtures = readdirSync(FIXTURES_DIR, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.flatMap((entry) =>
		loadFixtures(entry.name).map((fixture) => ({
			...fixture,
			name: `${entry.name}/${fixture.name}`,
		})),
	);

test("gate ROIs cover under a third of the frame", () => {
	assert.ok(GateRois.pixelCount(spans) < (1920 * 1080) / 3);
});

for (const fixture of fixtures) {
	test(`gate ROIs: ${fixture.name}`, async (t) => {
		const frame = normalizeFrame(
			imageFromFrameData(await readImage(fixture.framePath)),
		);
		const partial = withNoiseOutside(frame);
		for (const detector of detectors) {
			await t.test(detector.id, () => {
				const whole = detector.gate(frame);
				const onRois = detector.gate(partial);
				if (whole.pass) assert.equal(onRois.pass, true);
				else assert.deepEqual(onRois, whole);
			});
		}
	});
}

/** `frame` with every pixel outside the gate ROIs random. */
function withNoiseOutside(frame: Image): Image {
	const noise: Image = { ...frame, data: new Uint8Array(frame.data.length) };
	let state = 0x2545f491;
	for (let i = 0; i < noise.data.length; i++) {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		noise.data[i] = state & 0xff;
	}
	GateRois.scatter(spans, GateRois.gather(spans, frame), noise);
	return noise;
}
