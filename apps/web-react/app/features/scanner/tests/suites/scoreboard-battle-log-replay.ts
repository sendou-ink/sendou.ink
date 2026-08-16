/**
 * Golden-file suite for the ScoreboardBattleLogReplayDetector over every
 * fixture in scoreboard-battle-log-replay/, mirroring tests/scoreboard.test.ts,
 * plus the replay extras (timestamp, replay code, match scores) and a
 * cross-negative sweep: the replay gate must stay quiet on every
 * live-scoreboard positive.
 *
 * Replay parses are expensive (eight 68px weapon rows plus the Rowdy-face
 * code line), so the suite is sharded across processes:
 * tests/scoreboard-battle-log-replay.<n>.test.ts each run one shard. Every
 * fixture group is dealt round-robin, so
 * `node --test tests/scoreboard-battle-log-replay.*.test.ts` still covers
 * exactly what the old single file did.
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../../core/cv";
import type {
	ScoreboardPlayer,
	ScoreboardRowDebug,
} from "../../core/detectors/scoreboard/index";
import { createScoreboardBattleLogReplayDetector } from "../../core/detectors/scoreboard-battle-log-replay/index";
import {
	type Fixture,
	isFieldSkipped,
	loadFixtures,
	runDetectorOnFixture,
} from "../../node/fixtures";
import { loadScoreboardResources } from "../../node/resources";
import test from "../node-test-compat";

export async function runScoreboardBattleLogReplaySuite(
	shard: number,
	shardCount: number,
): Promise<void> {
	await loadOpenCV();
	const detector = createScoreboardBattleLogReplayDetector(
		await loadScoreboardResources(),
	);
	const fixtures = loadFixtures("scoreboard-battle-log-replay");
	const mine = <T>(items: T[]): T[] =>
		items.filter((_, i) => i % shardCount === shard);

	if (shard === 0) {
		test("replay fixtures exist", () => {
			assert.ok(
				fixtures.length > 0,
				"no fixtures found under scoreboard-battle-log-replay/",
			);
		});
	}

	for (const fixture of mine(fixtures)) {
		test(`scoreboard-battle-log-replay/${fixture.name}`, async (t) => {
			const { gate, events } = await runDetectorOnFixture(detector, fixture);
			const expectPositive =
				fixture.expected.event === "ScoreboardBattleLogReplay";

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
			const rows = (event.debug?.rows ?? []) as ScoreboardRowDebug[];
			const expected = fixture.expected.data ?? {};

			await t.test(
				"matchScores",
				{ skip: skip(fixture, "matchScores") },
				() => {
					assert.deepEqual(event.data.matchScores, expected.matchScores);
				},
			);

			await t.test(
				"header",
				{ skip: expected.mode === undefined || skip(fixture, "header") },
				() => {
					const dbg = event.debug?.header as
						| { topReading?: string; bottomReading?: string }
						| undefined;
					assert.deepEqual(
						{
							lobby: event.data.lobby,
							mode: event.data.mode,
							stage: event.data.stage,
						},
						{
							lobby: expected.lobby ?? null,
							mode: expected.mode ?? null,
							stage: expected.stage ?? null,
						},
						`header mismatch (readings: "${dbg?.topReading}" / "${dbg?.bottomReading}")`,
					);
				},
			);

			await t.test(
				"timestamp",
				{
					skip: expected.timestamp === undefined || skip(fixture, "timestamp"),
				},
				() => {
					const dbg = event.debug?.header as
						| { topReading?: string }
						| undefined;
					assert.equal(
						event.data.timestamp,
						expected.timestamp,
						`timestamp mismatch (reading: "${dbg?.topReading}")`,
					);
				},
			);

			await t.test(
				"replayCode",
				{
					skip:
						expected.replayCode === undefined || skip(fixture, "replayCode"),
				},
				() => {
					assert.equal(
						event.data.replayCode,
						expected.replayCode,
						`replay code mismatch (raw: "${event.debug?.codeRaw}")`,
					);
				},
			);

			await t.test(
				"povIndex",
				{ skip: expected.povIndex === undefined || skip(fixture, "povIndex") },
				() => {
					const fractions = rows.map((r) => r.povFraction.toFixed(3)).join(",");
					assert.equal(
						event.data.povIndex,
						expected.povIndex,
						`povIndex mismatch (yellow fractions=${fractions})`,
					);
				},
			);

			const players = expected.players ?? [];

			// Fixtures list the complete roster; empty pills (short teams) must be
			// skipped by the parser, not emitted as phantom players.
			await t.test(
				"player count",
				{ skip: expected.players === undefined || skip(fixture, "players") },
				() => {
					assert.equal(event.data.players.length, players.length);
				},
			);

			for (const [i, want] of players.entries()) {
				const got: ScoreboardPlayer | undefined = event.data.players[i];
				const dbg = rows[i];
				assert.ok(got, `row ${i} missing from parse`);

				await t.test(
					`row ${i} weapon`,
					{
						skip:
							want.weaponId === undefined ||
							skip(fixture, `players.${i}.weaponId`),
					},
					() => {
						const top = dbg?.weapon?.top
							.map((c) => `${c.id}:${c.score.toFixed(3)}`)
							.join(" ");
						assert.equal(
							got.weaponId,
							want.weaponId,
							`weapon mismatch (candidates: ${top})`,
						);
					},
				);

				await t.test(
					`row ${i} name`,
					{
						skip: want.name === undefined || skip(fixture, `players.${i}.name`),
					},
					() => {
						assert.equal(
							got.name,
							want.name,
							`name mismatch (min glyph score=${dbg?.nameScore.toFixed(3)})`,
						);
					},
				);

				await t.test(
					`row ${i} paint`,
					{
						skip:
							want.paint === undefined || skip(fixture, `players.${i}.paint`),
					},
					() => {
						assert.equal(
							got.paint,
							want.paint,
							`paint mismatch (score=${dbg?.paintScore.toFixed(3)})`,
						);
					},
				);

				await t.test(
					`row ${i} stats`,
					{
						skip: want.ka === undefined || skip(fixture, `players.${i}.stats`),
					},
					() => {
						const scores = dbg?.statScores.map((s) => s.toFixed(3)).join(",");
						assert.deepEqual(
							{ ka: got.ka, d: got.d, s: got.s },
							{ ka: want.ka, d: want.d ?? null, s: want.s ?? null },
							`stat mismatch (scores=${scores})`,
						);
					},
				);
			}
		});
	}

	// The scoreboard-shaped screens must not trigger each other's detectors;
	// the mirror sweeps live in scoreboard.test.ts and scoreboard-battle-log.test.ts.
	for (const fixture of mine([
		...loadFixtures("scoreboard").filter(
			(f) => f.expected.event === "Scoreboard",
		),
		...loadFixtures("scoreboard-battle-log").filter(
			(f) => f.expected.event === "ScoreboardBattleLog",
		),
	])) {
		test(`replay gate stays quiet on ${fixture.name}`, async () => {
			const { gate } = await runDetectorOnFixture(detector, fixture);
			assert.equal(
				gate.pass,
				false,
				`replay gate fired (score=${gate.score.toFixed(3)})`,
			);
		});
	}

	// Shared negatives (tests/fixtures/negative/): frames no detector may fire on.
	for (const fixture of mine(loadFixtures("negative"))) {
		test(`replay gate stays quiet on negative/${fixture.name}`, async () => {
			const { gate } = await runDetectorOnFixture(detector, fixture);
			assert.equal(
				gate.pass,
				false,
				`replay gate fired (score=${gate.score.toFixed(3)})`,
			);
		});
	}
}

function skip(fixture: Fixture, field: string): boolean | string {
	return isFieldSkipped(fixture, field) ? "skipFields" : false;
}
