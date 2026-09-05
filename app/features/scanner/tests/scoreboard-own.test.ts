/**
 * Golden-file tests for the ScoreboardOwnDetector over every fixture in
 * scoreboard-own/, plus cross-negative sweeps both ways.
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../core/cv";
import { createDeathDetector } from "../core/detectors/death/index";
import { createMapStartDetector } from "../core/detectors/map-start/index";
import { createScoreboardDetector } from "../core/detectors/scoreboard/index";
import { createScoreboardBattleLogReplayDetector } from "../core/detectors/scoreboard-battle-log-replay/index";
import {
	createScoreboardOwnDetector,
	type ScoreboardOwnData,
} from "../core/detectors/scoreboard-own/index";
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
const detector = createScoreboardOwnDetector(resources);
const fixtures = loadFixtures("scoreboard-own");

test("scoreboard-own fixtures exist", () => {
	assert.ok(fixtures.length > 0, "no fixtures found under scoreboard-own/");
});

for (const fixture of fixtures) {
	test(`scoreboard-own/${fixture.name}`, async (t) => {
		const { gate, events } = await runDetectorOnFixture<ScoreboardOwnData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "ScoreboardOwn";

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

		for (const field of ["lobby", "mode", "stage"] as const) {
			await t.test(
				field,
				{ skip: expected[field] === undefined || skip(fixture, field) },
				() => {
					assert.equal(
						event.data[field],
						expected[field],
						`${field} mismatch (header debug: ${JSON.stringify(event.debug?.header)})`,
					);
				},
			);
		}

		await t.test(
			"weapon",
			{ skip: expected.weaponId === undefined || skip(fixture, "weapon") },
			() => {
				assert.equal(
					event.data.weaponId,
					expected.weaponId,
					`weapon mismatch (read: "${event.debug?.weaponName}", raw: "${event.debug?.weaponReading}", score=${Number(event.debug?.weaponScore ?? 0).toFixed(3)})`,
				);
			},
		);

		for (const [row, wantRow] of (expected.abilities ?? []).entries()) {
			await t.test(
				`abilities row ${row}`,
				{ skip: skip(fixture, `abilities.${row}`) },
				() => {
					assert.deepEqual(
						event.data.abilities[row],
						wantRow,
						`ability row mismatch (debug: ${JSON.stringify((event.debug?.abilityRows as unknown[])?.[row])})`,
					);
				},
			);
		}
	});
}

// The own-results screen replaces everything else on screen; its gate may
// not fire on any other detector's positives, nor theirs on its fixtures.
const otherPositives = [
	...loadFixtures("scoreboard").filter(
		(f) => f.expected.event === "Scoreboard",
	),
	...loadFixtures("scoreboard-battle-log-replay").filter(
		(f) => f.expected.event === "ScoreboardBattleLogReplay",
	),
	...loadFixtures("death").filter((f) => f.expected.event === "Death"),
	...loadFixtures("map-start").filter((f) => f.expected.event === "MapStart"),
];
for (const fixture of otherPositives) {
	test(`scoreboard-own gate stays quiet on ${fixture.dir.split("/").slice(-2).join("/")}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`scoreboard-own gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

// Shared negatives (tests/fixtures/negative/): frames no detector may fire on.
for (const fixture of loadFixtures("negative")) {
	test(`scoreboard-own gate stays quiet on negative/${fixture.name}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`scoreboard-own gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

const otherDetectors: Detector<unknown>[] = [
	createScoreboardDetector(resources) as Detector<unknown>,
	createScoreboardBattleLogReplayDetector(resources) as Detector<unknown>,
	createDeathDetector(resources) as Detector<unknown>,
	createMapStartDetector(resources) as Detector<unknown>,
];
for (const fixture of fixtures.filter(
	(f) => f.expected.event === "ScoreboardOwn",
)) {
	test(`other gates stay quiet on scoreboard-own/${fixture.name}`, async () => {
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
