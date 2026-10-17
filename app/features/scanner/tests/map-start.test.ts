/**
 * Golden-file tests for the MapStartDetector over every fixture in map-start/,
 * plus cross-negative sweeps both ways against scoreboard, replay and death positives.
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../core/cv";
import { createDeathDetector } from "../core/detectors/death/index";
import {
	createMapStartDetector,
	type MapStartData,
} from "../core/detectors/map-start/index";
import { createScoreboardBattleLogReplayDetector } from "../core/detectors/scoreboard-battle-log-replay/index";
import { createScoreboardDetector } from "../core/detectors/scoreboard/index";
import {
	fieldTestOptions,
	loadFixtures,
	runDetectorOnFixture,
	withFixtureFrame,
} from "../node/fixtures";
import { loadScoreboardResources } from "../node/resources";
import { test } from "./node-test-compat";

await loadOpenCV();
const resources = await loadScoreboardResources();
const detector = createMapStartDetector(resources);
const fixtures = loadFixtures("map-start");

test("map-start fixtures exist", () => {
	assert.ok(fixtures.length > 0, "no fixtures found under map-start/");
});

for (const fixture of fixtures) {
	test(`map-start/${fixture.name}`, async (t) => {
		const { gate, events } = await runDetectorOnFixture<MapStartData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "MapStart";

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
				? "gate passed but parse emitted no event (label confirmation failed?)"
				: "no event (gate did not fire)",
		);
		const expected = fixture.expected.data ?? {};

		await t.test(
			"mode",
			fieldTestOptions(fixture, "mode", expected.mode !== undefined),
			() => {
				assert.equal(
					event.data.mode,
					expected.mode,
					`mode mismatch (raw: "${event.debug?.modeReading}", score=${Number(event.debug?.modeScore ?? 0).toFixed(3)})`,
				);
			},
		);

		await t.test(
			"stage",
			fieldTestOptions(fixture, "stage", expected.stage !== undefined),
			() => {
				assert.equal(
					event.data.stage,
					expected.stage,
					`stage mismatch (raw: "${event.debug?.stageReading}", score=${Number(event.debug?.stageScore ?? 0).toFixed(3)})`,
				);
			},
		);
	});
}

// The intro splash overlays live gameplay while the other screens replace or
// overlay it differently; none of the four gates may fire on another's positives.
const otherPositives = [
	...loadFixtures("scoreboard").filter(
		(f) => f.expected.event === "Scoreboard",
	),
	...loadFixtures("scoreboard-battle-log-replay").filter(
		(f) => f.expected.event === "ScoreboardBattleLogReplay",
	),
	...loadFixtures("death").filter((f) => f.expected.event === "Death"),
];
for (const fixture of otherPositives) {
	test(`map-start gate stays quiet on ${fixture.dir.split("/").slice(-2).join("/")}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`map-start gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

// Shared negatives (tests/fixtures/negative/): frames no detector may fire on.
for (const fixture of loadFixtures("negative")) {
	test(`map-start gate stays quiet on negative/${fixture.name}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`map-start gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

const scoreboardDetector = createScoreboardDetector(resources);
const replayDetector = createScoreboardBattleLogReplayDetector(resources);
const deathDetector = createDeathDetector(resources);
for (const fixture of fixtures.filter((f) => f.expected.event === "MapStart")) {
	test(`other gates stay quiet on map-start/${fixture.name}`, async () => {
		await withFixtureFrame(fixture, (frame) => {
			const live = scoreboardDetector.gate(frame);
			assert.equal(
				live.pass,
				false,
				`scoreboard gate fired (score=${live.score.toFixed(3)})`,
			);
			const replay = replayDetector.gate(frame);
			assert.equal(
				replay.pass,
				false,
				`replay gate fired (score=${replay.score.toFixed(3)})`,
			);
			const death = deathDetector.gate(frame);
			assert.equal(
				death.pass,
				false,
				`death gate fired (score=${death.score.toFixed(3)})`,
			);
		});
	});
}
