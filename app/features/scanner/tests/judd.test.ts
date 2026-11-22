/**
 * Golden-file tests for the JuddFlagDetector over every fixture in judd-flag/: the
 * flag raised on cast footage, and the lookalikes around it (the count-up
 * before the flag, the GAME! splash, the emotes after it, a turf floor up
 * close, a cast's lower third).
 */

import assert from "node:assert/strict";
import { createJuddFlagDetector } from "../core/detectors/judd/index";
import { createMapStartDetector } from "../core/detectors/map-start/index";
import { createObjectiveDetector } from "../core/detectors/objective/index";
import { createScoreboardDetector } from "../core/detectors/scoreboard/index";
import type { Detector } from "../core/detectors/types";
import type { DetectedEvent } from "../core/events";
import { TimelineBuilder } from "../core/timeline/index";
import {
	assertCompleteness,
	loadFixtures,
	runDetectorOnFixture,
} from "../node/fixtures";
import { loadScoreboardResources } from "../node/resources";
import { test } from "./node-test-compat";

const resources = await loadScoreboardResources();
const detector = createJuddFlagDetector();
const fixtures = loadFixtures("judd-flag");
const positives = fixtures.filter((f) => f.expected.event === "JuddFlag");

test("judd fixtures exist", () => {
	assert.ok(positives.length > 0, "no positive fixtures under judd-flag/");
	assert.ok(
		positives.length < fixtures.length,
		"no negative fixtures under judd-flag/",
	);
});

for (const fixture of fixtures) {
	test(`judd-flag/${fixture.name}`, async (t) => {
		const { gate, events } = await runDetectorOnFixture(detector, fixture);
		const expectPositive = fixture.expected.event === "JuddFlag";

		await t.test("gate", () => {
			assert.equal(
				gate.pass,
				expectPositive,
				`gate ${gate.pass ? "fired" : "did not fire"} (score=${gate.score.toFixed(3)}), expected ${expectPositive ? "fire" : "no fire"}`,
			);
		});

		if (!expectPositive) return;
		const event = events[0];
		assert.ok(event, "gate passed but parse emitted no event");
		const expected = fixture.expected.data ?? {};

		await t.test("completeness", () => {
			assertCompleteness(fixture, event);
		});

		await t.test("clears the timeline's score floor", () => {
			const { action } = new TimelineBuilder().push(event);
			assert.notEqual(action, "dropped");
		});

		await t.test("inks", () => {
			assert.equal(event.data.inks.length, expected.inkCount);
		});

		await t.test("winner", () => {
			const winner =
				event.data.winnerInk === null
					? null
					: event.data.inks.indexOf(event.data.winnerInk);
			assert.equal(winner, expected.winner);
		});
	});
}

// Shared negatives (tests/fixtures/negative/): frames no detector may fire on.
for (const fixture of loadFixtures("negative")) {
	test(`judd gate stays quiet on negative/${fixture.name}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`judd gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

// Results screens, intros and the counter share no frame with the flag.
const otherPositives = [
	...loadFixtures("scoreboard").filter(
		(f) => f.expected.event === "Scoreboard",
	),
	...loadFixtures("map-start").filter((f) => f.expected.event === "MapStart"),
	...loadFixtures("objective").filter((f) => f.expected.event === "Objective"),
];
for (const fixture of otherPositives) {
	test(`judd gate stays quiet on ${fixture.dir.split("/").slice(-2).join("/")}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`judd gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

const otherDetectors: Detector<DetectedEvent>[] = [
	createScoreboardDetector(resources),
	createMapStartDetector(resources),
	createObjectiveDetector(resources),
];
for (const fixture of positives) {
	test(`other gates stay quiet on judd-flag/${fixture.name}`, async () => {
		for (const other of otherDetectors) {
			const { gate } = await runDetectorOnFixture(other, fixture);
			assert.equal(
				gate.pass,
				false,
				`${other.id} gate fired (score=${gate.score.toFixed(3)})`,
			);
		}
	});
}
