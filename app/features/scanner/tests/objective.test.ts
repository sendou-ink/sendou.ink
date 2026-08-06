/**
 * Golden-file tests for the ObjectiveDetector over every fixture in
 * objective/, mirroring map-start.test.ts, plus cross-negative sweeps in
 * both directions: the objective gate must stay quiet on every other
 * detector's positives (and the shared negatives), and their gates must
 * stay quiet on the objective fixtures.
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../core/cv";
import { createDeathDetector } from "../core/detectors/death/index";
import { createMapStartDetector } from "../core/detectors/map-start/index";
import { createMinimapDetector } from "../core/detectors/minimap/index";
import {
	createObjectiveDetector,
	type ObjectiveData,
} from "../core/detectors/objective/index";
import { createScoreboardDetector } from "../core/detectors/scoreboard/index";
import { createScoreboardOwnDetector } from "../core/detectors/scoreboard-own/index";
import { createScoreboardReplayDetector } from "../core/detectors/scoreboard-replay/index";
import type { Detector } from "../core/detectors/types";
import {
	type Fixture,
	isFieldSkipped,
	loadFixtures,
	runDetectorOnFixture,
} from "../node/fixtures";
import { loadScoreboardResources } from "../node/resources";
import test from "./node-test-compat";

await loadOpenCV();
const resources = await loadScoreboardResources();
const detector = createObjectiveDetector(resources);
const fixtures = loadFixtures("objective");

test("objective fixtures exist", () => {
	assert.ok(fixtures.length > 0, "no fixtures found under objective/");
});

for (const fixture of fixtures) {
	test(`objective/${fixture.name}`, async (t) => {
		const { gate, events } = await runDetectorOnFixture<ObjectiveData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "Objective";

		await t.test("gate", () => {
			assert.equal(
				gate.pass,
				expectPositive,
				`gate ${gate.pass ? "fired" : "did not fire"} (score=${gate.score.toFixed(3)}), expected ${expectPositive ? "fire" : "no fire"}`,
			);
		});

		if (!expectPositive) return;
		const event = events[0];
		assert.ok(
			event,
			gate.pass
				? "gate passed but parse emitted no event (no readable count?)"
				: "no event (gate did not fire)",
		);
		const expected = fixture.expected.data ?? {};
		const debug = () => JSON.stringify(event.debug);

		await t.test(
			"mode",
			{ skip: expected.mode === undefined || skip(fixture, "mode") },
			() => {
				assert.equal(event.data.mode, expected.mode);
			},
		);

		await t.test(
			"time",
			{ skip: expected.time === undefined || skip(fixture, "time") },
			() => {
				assert.equal(
					event.data.time,
					expected.time,
					`time mismatch (${debug()})`,
				);
			},
		);

		for (const side of [0, 1] as const) {
			await t.test(
				`score[${side}]`,
				{
					skip: expected.score === undefined || skip(fixture, `score.${side}`),
				},
				() => {
					assert.equal(
						event.data.score[side],
						expected.score![side],
						`score[${side}] mismatch (${debug()})`,
					);
				},
			);
			await t.test(
				`penalty[${side}]`,
				{
					skip:
						expected.penalty === undefined || skip(fixture, `penalty.${side}`),
				},
				() => {
					assert.equal(
						event.data.penalty[side],
						expected.penalty![side],
						`penalty[${side}] mismatch (${debug()})`,
					);
				},
			);
			await t.test(
				`control[${side}]`,
				{
					skip:
						expected.control === undefined || skip(fixture, `control.${side}`),
				},
				() => {
					assert.equal(
						event.data.control[side],
						expected.control![side],
						`control[${side}] mismatch (${debug()})`,
					);
				},
			);
		}
	});
}

// Screens that replace gameplay can never show the counters — the gate must
// stay quiet on their positives.
const otherPositiveSets = [
	["scoreboard", "Scoreboard"],
	["scoreboard-replay", "ScoreboardReplay"],
	["scoreboard-own", "ScoreboardOwn"],
	["map-start", "MapStart"],
	["minimap", "Minimap"],
] as const;
for (const [dir, eventType] of otherPositiveSets) {
	for (const fixture of loadFixtures(dir).filter(
		(f) => f.expected.event === eventType,
	)) {
		test(`objective gate stays quiet on ${dir}/${fixture.name}`, async () => {
			const { gate } = await runDetectorOnFixture(detector, fixture);
			assert.equal(
				gate.pass,
				false,
				`objective gate fired (score=${gate.score.toFixed(3)})`,
			);
		});
	}
}

// No sweep over death positives: the death overlay rides live gameplay
// whose counter HUD stays visible (several death fixtures show full,
// correctly-readable plates), so neither gate- nor parse-level quiet can be
// promised there. Death frames with counters make fine objective fixtures.

// Shared negatives (tests/fixtures/negative/): frames no detector may fire on.
for (const fixture of loadFixtures("negative")) {
	test(`objective gate stays quiet on negative/${fixture.name}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`objective gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

const otherDetectors: readonly [string, Detector<unknown>][] = [
	["scoreboard", createScoreboardDetector(resources) as Detector<unknown>],
	[
		"scoreboard-replay",
		createScoreboardReplayDetector(resources) as Detector<unknown>,
	],
	[
		"scoreboard-own",
		createScoreboardOwnDetector(resources) as Detector<unknown>,
	],
	["death", createDeathDetector(resources) as Detector<unknown>],
	["map-start", createMapStartDetector(resources) as Detector<unknown>],
	["minimap", createMinimapDetector(resources) as Detector<unknown>],
];
for (const fixture of fixtures.filter(
	(f) => f.expected.event === "Objective",
)) {
	test(`other gates stay quiet on objective/${fixture.name}`, async () => {
		for (const [name, other] of otherDetectors) {
			const { gate } = await runDetectorOnFixture(other, fixture);
			assert.equal(
				gate.pass,
				false,
				`${name} gate fired (score=${gate.score.toFixed(3)})`,
			);
		}
	});
}

function skip(fixture: Fixture, field: string): boolean | string {
	return isFieldSkipped(fixture, field) ? "skipFields" : false;
}
