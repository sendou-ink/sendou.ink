/**
 * Golden-file tests for the MinimapDetector over every fixture in minimap/,
 * plus cross-negative sweeps in both directions: the minimap gate must stay
 * quiet on every other detector's positives (and the shared negatives), and
 * every other gate must stay quiet on the minimap fixtures.
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../core/cv";
import { createDeathDetector } from "../core/detectors/death/index";
import { createMapStartDetector } from "../core/detectors/map-start/index";
import {
	createMinimapDetector,
	type MinimapData,
} from "../core/detectors/minimap/index";
import { createScoreboardDetector } from "../core/detectors/scoreboard/index";
import { createScoreboardBattleLogReplayDetector } from "../core/detectors/scoreboard-battle-log-replay/index";
import { createScoreboardOwnDetector } from "../core/detectors/scoreboard-own/index";
import type { Detector } from "../core/detectors/types";
import { hueDistance, hueOf } from "../core/ink-color";
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
const detector = createMinimapDetector(resources);
const fixtures = loadFixtures("minimap");

test("minimap fixtures exist", () => {
	assert.ok(fixtures.length > 0, "no fixtures found under minimap/");
});

for (const fixture of fixtures) {
	test(`minimap/${fixture.name}`, async (t) => {
		const { gate, events } = await runDetectorOnFixture<MinimapData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "Minimap";

		await t.test("gate", () => {
			assert.equal(
				gate.pass,
				expectPositive,
				`gate ${gate.pass ? "fired" : "did not fire"} (score=${gate.score.toFixed(3)}), expected ${expectPositive ? "fire" : "no fire"}`,
			);
		});

		if (!expectPositive) return;
		const event = events[0];
		assert.ok(event, "gate passed but no event parsed");
		const expected = fixture.expected.data ?? {};

		await t.test(
			"spectator",
			{ skip: expected.spectator === undefined },
			() => {
				assert.equal(event.data.spectator, expected.spectator);
			},
		);

		await t.test(
			"stage",
			{ skip: expected.stage === undefined || skip(fixture, "stage") },
			() => {
				assert.equal(
					event.data.stage,
					expected.stage,
					`stage mismatch (debug: ${JSON.stringify(event.debug?.stage)})`,
				);
			},
		);

		// an expected array also pins the count, so a spectator stub (or a
		// misaligned parse) can't smuggle in phantom cards or rows
		await t.test(
			"teammate count",
			{ skip: expected.teammates === undefined },
			() => {
				assert.equal(event.data.teammates.length, expected.teammates?.length);
			},
		);
		await t.test(
			"enemy count",
			{ skip: expected.enemies === undefined },
			() => {
				assert.equal(event.data.enemies.length, expected.enemies?.length);
			},
		);

		for (const [i, want] of (expected.teammates ?? []).entries()) {
			await t.test(
				`teammate ${i} (${want.slot ?? "?"})`,
				{ skip: skip(fixture, `teammates.${i}`) },
				() => {
					const got = event.data.teammates[i];
					assert.ok(
						got,
						`teammate ${i} missing (got ${event.data.teammates.length})`,
					);
					const cardDebug = JSON.stringify(
						(event.debug?.cards as unknown[])?.[i],
					);
					if (want.slot !== undefined) assert.equal(got.slot, want.slot);
					if (
						want.name !== undefined &&
						!isFieldSkipped(fixture, `teammates.${i}.name`)
					) {
						assert.equal(got.name, want.name, `name (debug: ${cardDebug})`);
					}
					if (
						want.weaponId !== undefined &&
						!isFieldSkipped(fixture, `teammates.${i}.weapon`)
					) {
						assert.equal(
							got.weaponId,
							want.weaponId,
							`weapon (debug: ${cardDebug})`,
						);
					}
					if (
						want.abilities !== undefined &&
						!isFieldSkipped(fixture, `teammates.${i}.abilities`)
					) {
						assert.deepEqual(
							got.abilities,
							want.abilities,
							`abilities (debug: ${cardDebug})`,
						);
					}
					if (want.dead !== undefined) {
						assert.equal(got.dead, want.dead, `dead (debug: ${cardDebug})`);
					}
					if (want.specialReady !== undefined) {
						assert.equal(
							got.specialReady,
							want.specialReady,
							`specialReady (debug: ${cardDebug})`,
						);
					}
				},
			);
		}

		for (const [i, want] of (expected.enemies ?? []).entries()) {
			await t.test(
				`enemy ${i}`,
				{ skip: skip(fixture, `enemies.${i}`) },
				() => {
					const got = event.data.enemies[i];
					assert.ok(
						got,
						`enemy row ${i} missing (got ${event.data.enemies.length})`,
					);
					const rowDebug = JSON.stringify(
						(event.debug?.enemies as unknown[])?.[i],
					);
					if (
						want.name !== undefined &&
						!isFieldSkipped(fixture, `enemies.${i}.name`)
					) {
						assert.equal(got.name, want.name, `name (debug: ${rowDebug})`);
					}
					if (
						want.weaponId !== undefined &&
						!isFieldSkipped(fixture, `enemies.${i}.weapon`)
					) {
						assert.equal(
							got.weaponId,
							want.weaponId,
							`weapon (debug: ${rowDebug})`,
						);
					}
					if (
						want.abilities !== undefined &&
						!isFieldSkipped(fixture, `enemies.${i}.abilities`)
					) {
						assert.deepEqual(
							got.abilities,
							want.abilities,
							`abilities (debug: ${rowDebug})`,
						);
					}
					if (want.dead !== undefined) {
						assert.equal(got.dead, want.dead, `dead (debug: ${rowDebug})`);
					}
					if (want.specialReady !== undefined) {
						assert.equal(
							got.specialReady,
							want.specialReady,
							`specialReady (debug: ${rowDebug})`,
						);
					}
				},
			);
		}
	});
}

// The columns' sub-tile ink means anchor the objective counter's color
// clusters to `teams` order (match-builder); the SWS26 spectator fixture
// pairs with objective/splat-zones-cast-* from the same game, where the
// plates read green ~78° and purple ~302°.
test("spectator sub tiles read the two team ink colors", async () => {
	const fixture = fixtures.find((f) => f.name === "spectator-sws26-swiss");
	assert.ok(fixture, "spectator-sws26-swiss fixture missing");
	const { events } = await runDetectorOnFixture<MinimapData>(
		detector,
		fixture!,
	);
	const teamColors = events[0]?.data.teamColors;
	assert.ok(teamColors?.[0] && teamColors[1], "column ink color unreadable");
	const [alpha, bravo] = teamColors;
	assert.ok(
		hueDistance(hueOf(alpha), hueOf(bravo)) >= 90,
		"the two columns' ink hues do not separate",
	);
	assert.ok(hueDistance(hueOf(alpha), 84) <= 25, "left column is not green");
	assert.ok(hueDistance(hueOf(bravo), 300) <= 25, "right column is not purple");
});

// The map overlay replaces everything else on screen; its gate may not fire
// on any other detector's positives, nor theirs on the minimap fixtures.
const otherPositives = [
	...loadFixtures("scoreboard").filter(
		(f) => f.expected.event === "Scoreboard",
	),
	...loadFixtures("scoreboard-battle-log-replay").filter(
		(f) => f.expected.event === "ScoreboardBattleLogReplay",
	),
	...loadFixtures("scoreboard-own").filter(
		(f) => f.expected.event === "ScoreboardOwn",
	),
	...loadFixtures("death").filter((f) => f.expected.event === "Death"),
	...loadFixtures("map-start").filter((f) => f.expected.event === "MapStart"),
];
for (const fixture of otherPositives) {
	test(`minimap gate stays quiet on ${fixture.dir.split("/").slice(-2).join("/")}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`minimap gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

// Shared negatives (tests/fixtures/negative/): frames no detector may fire on.
for (const fixture of loadFixtures("negative")) {
	test(`minimap gate stays quiet on negative/${fixture.name}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`minimap gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

const otherDetectors: Detector<unknown>[] = [
	createScoreboardDetector(resources) as Detector<unknown>,
	createScoreboardBattleLogReplayDetector(resources) as Detector<unknown>,
	createScoreboardOwnDetector(resources) as Detector<unknown>,
	createDeathDetector(resources) as Detector<unknown>,
	createMapStartDetector(resources) as Detector<unknown>,
];
for (const fixture of fixtures.filter((f) => f.expected.event === "Minimap")) {
	test(`other gates stay quiet on minimap/${fixture.name}`, async () => {
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

function skip(fixture: Fixture, field: string): boolean | string {
	return isFieldSkipped(fixture, field) ? "skipFields" : false;
}
