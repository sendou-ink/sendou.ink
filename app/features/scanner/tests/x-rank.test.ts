/**
 * Golden-file tests for the X Battle card detectors (x-set-count/,
 * x-set-result/, x-rank-position/), plus cross-negative sweeps: no X gate may
 * fire on another detector's fixture or on another card, and no other
 * registry gate may fire on an X card.
 */

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { loadOpenCV } from "../core/cv";
import { createAllDetectors } from "../core/detectors/registry";
import type { Detector } from "../core/detectors/types";
import { createXRankPositionDetector } from "../core/detectors/x-rank/position";
import { createXSetCountDetector } from "../core/detectors/x-rank/set-count";
import { createXSetResultDetector } from "../core/detectors/x-rank/set-result";
import {
	FIXTURES_DIR,
	type Fixture,
	fieldTestOptions,
	loadFixtures,
	runDetectorOnFixture,
} from "../node/fixtures";
import { loadScoreboardResources } from "../node/resources";
import { test } from "./node-test-compat";

/** TimelineBuilder's default minConfidence */
const TIMELINE_MIN_CONFIDENCE = 0.6;

await loadOpenCV();
const resources = await loadScoreboardResources();

const CARDS: {
	dir: string;
	event: Fixture["expected"]["event"];
	detector: Detector<unknown>;
	fields: string[];
}[] = [
	{
		dir: "x-set-count",
		event: "XSetCount",
		detector: createXSetCountDetector(resources) as Detector<unknown>,
		fields: ["mode", "wins", "losses"],
	},
	{
		dir: "x-set-result",
		event: "XSetResult",
		detector: createXSetResultDetector(resources) as Detector<unknown>,
		fields: ["mode", "results", "powerChange", "power"],
	},
	{
		dir: "x-rank-position",
		event: "XRankPosition",
		detector: createXRankPositionDetector(resources) as Detector<unknown>,
		fields: ["mode", "position", "direction"],
	},
];

for (const { dir, event: eventType, detector, fields } of CARDS) {
	const fixtures = loadFixtures(dir);

	test(`${dir} fixtures exist`, () => {
		assert.ok(fixtures.length > 0, `no fixtures found under ${dir}/`);
	});

	for (const fixture of fixtures) {
		test(`${dir}/${fixture.name}`, async (t) => {
			const { gate, events } = await runDetectorOnFixture(detector, fixture);
			const expectPositive = fixture.expected.event === eventType;

			await t.test("gate", () => {
				assert.equal(
					gate.pass,
					expectPositive,
					`gate ${gate.pass ? "fired" : "did not fire"} (score=${gate.score.toFixed(3)})`,
				);
			});
			if (!expectPositive) return;

			const event = events[0];
			assert.ok(event, "gate passed but parse emitted no event");
			const untrusted = fixture.expected.options?.untrusted === true;
			await t.test(
				untrusted
					? "confidence stays under the timeline floor"
					: "confidence clears the timeline floor",
				() => {
					assert.equal(
						event.confidence >= TIMELINE_MIN_CONFIDENCE,
						!untrusted,
						`confidence ${event.confidence.toFixed(3)} (${JSON.stringify(event.debug)})`,
					);
				},
			);
			const expected = (fixture.expected.data ?? {}) as Record<string, unknown>;
			const data = event.data as Record<string, unknown>;
			for (const field of fields) {
				await t.test(
					field,
					fieldTestOptions(fixture, field, expected[field] !== undefined),
					() => {
						assert.deepEqual(
							data[field],
							expected[field],
							`${field} mismatch (${JSON.stringify(event.debug)})`,
						);
					},
				);
			}
		});
	}
}

const xPositives = CARDS.flatMap(({ dir, event }) =>
	loadFixtures(dir).filter((f) => f.expected.event === event),
);

const otherFixtures = readdirSync(FIXTURES_DIR, { withFileTypes: true })
	.filter((e) => e.isDirectory() && !CARDS.some((c) => c.dir === e.name))
	.flatMap((e) => loadFixtures(e.name));
for (const fixture of otherFixtures) {
	test(`X card gates stay quiet on ${fixtureLabel(fixture)}`, async () => {
		for (const { detector } of CARDS) {
			const { gate } = await runDetectorOnFixture(detector, fixture);
			assert.equal(
				gate.pass,
				false,
				`${detector.id} gate fired (score=${gate.score.toFixed(3)})`,
			);
		}
	});
}

const xDetectorIds = new Set(CARDS.map((c) => c.detector.id));
const otherDetectors = createAllDetectors(resources).filter(
	(d) => !xDetectorIds.has(d.id),
);
for (const fixture of xPositives) {
	test(`other gates stay quiet on ${fixtureLabel(fixture)}`, async () => {
		const cardDir = fixture.dir.split("/").at(-2);
		const others = [
			...otherDetectors,
			...CARDS.filter((c) => c.dir !== cardDir).map((c) => c.detector),
		];
		for (const detector of others) {
			const { gate } = await runDetectorOnFixture(detector, fixture);
			assert.equal(
				gate.pass,
				false,
				`${detector.id} gate fired (score=${gate.score.toFixed(3)})`,
			);
		}
	});
}

function fixtureLabel(fixture: Fixture): string {
	return fixture.dir.split("/").slice(-2).join("/");
}
