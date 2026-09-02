/**
 * Golden-file suite for the DeathDetector over every fixture in death/, plus
 * cross-negative sweeps both ways against scoreboard and replay positives.
 * Death parses are the most expensive in the repo (four burst-line reads plus
 * up to six splash-tag name passes each), so the suite is sharded across
 * processes: death.<n>.test.ts each run one round-robin shard.
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../../core/cv";
import {
	createDeathDetector,
	type DeathData,
} from "../../core/detectors/death/index";
import { createScoreboardDetector } from "../../core/detectors/scoreboard/index";
import { createScoreboardBattleLogReplayDetector } from "../../core/detectors/scoreboard-battle-log-replay/index";
import {
	type Fixture,
	isFieldSkipped,
	loadFixtures,
	runDetectorOnFixture,
} from "../../node/fixtures";
import { loadScoreboardResources } from "../../node/resources";
import test from "../node-test-compat";

export async function runDeathSuite(
	shard: number,
	shardCount: number,
): Promise<void> {
	await loadOpenCV();
	const resources = await loadScoreboardResources();
	const detector = createDeathDetector(resources);
	const fixtures = loadFixtures("death");
	const mine = <T>(items: T[]): T[] =>
		items.filter((_, i) => i % shardCount === shard);

	if (shard === 0) {
		test("death fixtures exist", () => {
			assert.ok(fixtures.length > 0, "no fixtures found under death/");
		});
	}

	for (const fixture of mine(fixtures)) {
		test(`death/${fixture.name}`, async (t) => {
			const { gate, events } = await runDetectorOnFixture<DeathData>(
				detector,
				fixture,
			);
			const expectPositive = fixture.expected.event === "Death";

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
				"weapon",
				{ skip: expected.weaponId === undefined || skip(fixture, "weapon") },
				() => {
					assert.equal(
						event.data.weaponId,
						expected.weaponId,
						`weapon mismatch (read: "${event.debug?.weaponName}", raw: "${event.debug?.weaponRaw}", score=${Number(event.debug?.weaponScore ?? 0).toFixed(3)})`,
					);
					if (expected.weaponType !== undefined) {
						assert.equal(event.data.weaponType, expected.weaponType);
					}
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

			await t.test(
				"name",
				{ skip: expected.name === undefined || skip(fixture, "name") },
				() => {
					assert.equal(
						event.data.name,
						expected.name,
						`name mismatch (raw: "${event.debug?.nameRaw}", score=${Number(event.debug?.nameScore ?? 0).toFixed(3)})`,
					);
				},
			);
		});
	}

	// The death overlay sits on live gameplay while the scoreboards replace it;
	// none of the three gates may fire on another detector's positives.
	const scoreboardPositives = loadFixtures("scoreboard").filter(
		(f) => f.expected.event === "Scoreboard",
	);
	const replayPositives = loadFixtures("scoreboard-battle-log-replay").filter(
		(f) => f.expected.event === "ScoreboardBattleLogReplay",
	);
	for (const fixture of mine([...scoreboardPositives, ...replayPositives])) {
		test(`death gate stays quiet on ${fixture.dir.split("/").slice(-2).join("/")}`, async () => {
			const { gate } = await runDetectorOnFixture(detector, fixture);
			assert.equal(
				gate.pass,
				false,
				`death gate fired (score=${gate.score.toFixed(3)})`,
			);
		});
	}

	// Shared negatives (tests/fixtures/negative/): frames no detector may fire on.
	for (const fixture of mine(loadFixtures("negative"))) {
		test(`death gate stays quiet on negative/${fixture.name}`, async () => {
			const { gate } = await runDetectorOnFixture(detector, fixture);
			assert.equal(
				gate.pass,
				false,
				`death gate fired (score=${gate.score.toFixed(3)})`,
			);
		});
	}

	const crossFixtures = mine(
		fixtures.filter((f) => f.expected.event === "Death"),
	);
	if (crossFixtures.length > 0) {
		const scoreboardDetector = createScoreboardDetector(resources);
		const replayDetector = createScoreboardBattleLogReplayDetector(resources);
		for (const fixture of crossFixtures) {
			test(`scoreboard gates stay quiet on death/${fixture.name}`, async () => {
				const live = await runDetectorOnFixture(scoreboardDetector, fixture);
				assert.equal(
					live.gate.pass,
					false,
					`scoreboard gate fired (score=${live.gate.score.toFixed(3)})`,
				);
				const replay = await runDetectorOnFixture(replayDetector, fixture);
				assert.equal(
					replay.gate.pass,
					false,
					`replay gate fired (score=${replay.gate.score.toFixed(3)})`,
				);
			});
		}
	}
}

function skip(fixture: Fixture, field: string): boolean | string {
	return isFieldSkipped(fixture, field) ? "skipFields" : false;
}
