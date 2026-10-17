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
import { createScoreboardBattleLogReplayDetector } from "../../core/detectors/scoreboard-battle-log-replay/index";
import { createScoreboardDetector } from "../../core/detectors/scoreboard/index";
import type { Detector } from "../../core/detectors/types";
import { type FrameData, normalizeFrame, toMat } from "../../core/image";
import {
	fieldTestOptions,
	loadFixtures,
	runDetectorOnFixture,
	withFixtureFrame,
} from "../../node/fixtures";
import { readImage } from "../../node/image-io";
import { loadScoreboardResources } from "../../node/resources";
import { test } from "../node-test-compat";

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
				fieldTestOptions(fixture, "weapon", expected.weaponId !== undefined),
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
					fieldTestOptions(fixture, `abilities.${row}`),
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
				fieldTestOptions(fixture, "name", expected.name !== undefined),
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

	// The tag memo outlives games: a later killer whose name differs by a word
	// on the same plain banner must be read, not handed the earlier name.
	if (shard === 0) {
		test("death tag memo re-reads a near-twin name on the same plain banner", async () => {
			const fixture = fixtures.find((f) => f.name === "plain-banner-mesh-cap");
			assert.ok(fixture, "fixture death/plain-banner-mesh-cap missing");
			const freshDetector = createDeathDetector(resources);
			const original = await readImage(fixture.framePath);
			const twin = withCapWordErased(await readImage(fixture.framePath));

			assert.equal(parseKillerName(freshDetector, original), "Mesh Cap");
			assert.equal(parseKillerName(freshDetector, twin), "Mesh");
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
				});
			});
		}
	}
}

function parseKillerName(
	detector: Detector<DeathData>,
	image: FrameData,
): string | null | undefined {
	const src = toMat(image);
	const frame = normalizeFrame(src);
	src.delete();
	const gate = detector.gate(frame);
	const events = gate.pass ? detector.parse(frame, 0, gate) : [];
	frame.delete();
	return events[0]?.data.name;
}

/** plain-banner-mesh-cap's tag reading "Mesh": "Cap" painted over with the banner column beside it. */
function withCapWordErased(image: FrameData): FrameData {
	const BACKGROUND_X = 1480;
	for (let y = 805; y < 880; y++) {
		for (let x = 1485; x < 1630; x++) {
			for (let c = 0; c < 4; c++) {
				image.data[(y * image.width + x) * 4 + c] =
					image.data[(y * image.width + BACKGROUND_X) * 4 + c]!;
			}
		}
	}
	return image;
}
