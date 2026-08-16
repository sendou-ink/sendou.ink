/**
 * Golden-file suite for the ScoreboardBattleLogDetector over every fixture in
 * scoreboard-battle-log/, mirroring
 * tests/suites/scoreboard-battle-log-replay.ts (the battle log shows the same
 * data sans the replay code), plus cross-negative sweeps: the battle log gate
 * must stay quiet on both lookalike results screens.
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../core/cv";
import type {
	ScoreboardPlayer,
	ScoreboardRowDebug,
} from "../core/detectors/scoreboard/index";
import {
	createScoreboardBattleLogDetector,
	SCOREBOARD_BATTLE_LOG_EVENT_TYPE,
} from "../core/detectors/scoreboard-battle-log/index";
import {
	type Fixture,
	isFieldSkipped,
	loadFixtures,
	runDetectorOnFixture,
} from "../node/fixtures";
import { loadScoreboardResources } from "../node/resources";
import test from "./node-test-compat";

await loadOpenCV();
const detector = createScoreboardBattleLogDetector(
	await loadScoreboardResources(),
);
const fixtures = loadFixtures("scoreboard-battle-log");

test("scoreboard-battle-log fixtures exist", () => {
	assert.ok(
		fixtures.length > 0,
		"no fixtures found under scoreboard-battle-log/",
	);
});

for (const fixture of fixtures) {
	test(`scoreboard-battle-log/${fixture.name}`, async (t) => {
		const { gate, events } = await runDetectorOnFixture(detector, fixture);
		const expectPositive =
			fixture.expected.event === SCOREBOARD_BATTLE_LOG_EVENT_TYPE;

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

		await t.test("matchScores", { skip: skip(fixture, "matchScores") }, () => {
			const dbg = event.debug?.matchScore as
				| { left?: { reading?: string }; right?: { reading?: string } }
				| undefined;
			assert.deepEqual(
				event.data.matchScores,
				expected.matchScores,
				`matchScores mismatch (readings: "${dbg?.left?.reading}" / "${dbg?.right?.reading}")`,
			);
		});

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
				const dbg = event.debug?.header as { topReading?: string } | undefined;
				assert.equal(
					event.data.timestamp,
					expected.timestamp,
					`timestamp mismatch (reading: "${dbg?.topReading}")`,
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
					skip: want.paint === undefined || skip(fixture, `players.${i}.paint`),
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

// The three scoreboard-shaped screens must not trigger each other's
// detectors; the mirror sweeps live in scoreboard.test.ts and
// suites/scoreboard-battle-log-replay.ts.
for (const fixture of [
	...loadFixtures("scoreboard").filter(
		(f) => f.expected.event === "Scoreboard",
	),
	...loadFixtures("scoreboard-battle-log-replay").filter(
		(f) => f.expected.event === "ScoreboardBattleLogReplay",
	),
]) {
	test(`scoreboard-battle-log gate stays quiet on ${fixture.name}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`scoreboard-battle-log gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

// Shared negatives (tests/fixtures/negative/): frames no detector may fire on.
for (const fixture of loadFixtures("negative")) {
	test(`scoreboard-battle-log gate stays quiet on negative/${fixture.name}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`scoreboard-battle-log gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

function skip(fixture: Fixture, field: string): boolean | string {
	return isFieldSkipped(fixture, field) ? "skipFields" : false;
}
