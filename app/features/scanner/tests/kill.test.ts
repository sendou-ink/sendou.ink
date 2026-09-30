/**
 * Golden-file tests for the KillDetector over every fixture in kill/, plus
 * cross-negative sweeps both ways: the kill gate must stay quiet on every
 * other detector's positives and the shared negatives, and the gates of
 * screens that replace live gameplay must stay quiet on kill positives
 * (death and objective ride the same live HUD and legitimately fire).
 */

import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { loadOpenCV } from "../core/cv";
import {
	createKillDetector,
	type KillData,
} from "../core/detectors/kill/index";
import { createMapStartDetector } from "../core/detectors/map-start/index";
import { createMinimapDetector } from "../core/detectors/minimap/index";
import { createScoreboardDetector } from "../core/detectors/scoreboard/index";
import { createScoreboardBattleLogDetector } from "../core/detectors/scoreboard-battle-log/index";
import { createScoreboardBattleLogReplayDetector } from "../core/detectors/scoreboard-battle-log-replay/index";
import { createScoreboardOwnDetector } from "../core/detectors/scoreboard-own/index";
import type { Detector } from "../core/detectors/types";
import { normalizeFrame, toMat } from "../core/image";
import {
	type Fixture,
	isFieldSkipped,
	loadFixtures,
	runDetectorOnFixture,
} from "../node/fixtures";
import { readImage } from "../node/image-io";
import { loadScoreboardResources } from "../node/resources";
import { test } from "./node-test-compat";

await loadOpenCV();
const resources = await loadScoreboardResources();
const detector = createKillDetector(resources);
const fixtures = loadFixtures("kill");

test("kill fixtures exist", () => {
	assert.ok(fixtures.length > 0, "no fixtures found under kill/");
});

for (const fixture of fixtures) {
	test(`kill/${fixture.name}`, async (t) => {
		const { gate, events } = await runDetectorOnFixture<KillData>(
			detector,
			fixture,
		);
		const expectPositive = fixture.expected.event === "Kill";

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
				? "gate passed but parse emitted no event (no row read as a feed message?)"
				: "no event (gate did not fire)",
		);
		const expected = fixture.expected.data ?? {};
		const debug = () => JSON.stringify(event.debug);

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

		await t.test(
			"rows",
			{ skip: expected.names === undefined || skip(fixture, "names") },
			() => {
				assert.equal(
					event.data.names.length,
					expected.names!.length,
					`row count mismatch (${debug()})`,
				);
			},
		);

		for (const [row, want] of (expected.names ?? []).entries()) {
			await t.test(
				`names[${row}]`,
				{ skip: skip(fixture, `names.${row}`) },
				() => {
					assert.equal(
						event.data.names[row],
						want,
						`name mismatch (${debug()})`,
					);
				},
			);
		}
	});
}

// The feed sits on live gameplay, which the other screens replace; the kill
// gate must stay quiet on every other detector's positives — except the
// frames a kill fixture shares (symlinked): those legitimately show a feed.
const killFrames = new Set(fixtures.map((f) => realpathSync(f.framePath)));
const otherPositives: readonly [string, string][] = [
	["scoreboard", "Scoreboard"],
	["scoreboard-battle-log-replay", "ScoreboardBattleLogReplay"],
	["scoreboard-battle-log", "ScoreboardBattleLog"],
	["scoreboard-own", "ScoreboardOwn"],
	["death", "Death"],
	["map-start", "MapStart"],
	["minimap", "Minimap"],
	["objective", "Objective"],
	["player-status", "PlayerStatus"],
	["strip-weapons", "StripWeapons"],
];
for (const [dir, eventType] of otherPositives) {
	for (const fixture of loadFixtures(dir).filter(
		(f) =>
			f.expected.event === eventType &&
			!killFrames.has(realpathSync(f.framePath)),
	)) {
		test(`kill gate stays quiet on ${dir}/${fixture.name}`, async () => {
			const { gate } = await runDetectorOnFixture(detector, fixture);
			assert.equal(
				gate.pass,
				false,
				`kill gate fired (score=${gate.score.toFixed(3)})`,
			);
		});
	}
}

// ...and on the shared negatives (tests/fixtures/negative/).
for (const fixture of loadFixtures("negative")) {
	test(`kill gate stays quiet on negative/${fixture.name}`, async () => {
		const { gate } = await runDetectorOnFixture(detector, fixture);
		assert.equal(
			gate.pass,
			false,
			`kill gate fired (score=${gate.score.toFixed(3)})`,
		);
	});
}

// Death and objective overlays share the live HUD with the feed (the
// double-row fixture shows a trade with the death cam up), so only the
// screen-replacing detectors are swept the other way.
const otherDetectors: readonly [string, Detector<unknown>][] = [
	["scoreboard", createScoreboardDetector(resources) as Detector<unknown>],
	[
		"scoreboard-battle-log-replay",
		createScoreboardBattleLogReplayDetector(resources) as Detector<unknown>,
	],
	[
		"scoreboard-battle-log",
		createScoreboardBattleLogDetector(resources) as Detector<unknown>,
	],
	[
		"scoreboard-own",
		createScoreboardOwnDetector(resources) as Detector<unknown>,
	],
	["map-start", createMapStartDetector(resources) as Detector<unknown>],
	["minimap", createMinimapDetector(resources) as Detector<unknown>],
];
for (const fixture of fixtures.filter((f) => f.expected.event === "Kill")) {
	test(`other gates stay quiet on kill/${fixture.name}`, async () => {
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

// A row read repeats across the frames it shows; the memo must hand the same
// read back on a later frame and start blank when the clock stands still or
// rewinds (a fresh scan, this harness parsing every fixture at t=0).
test("row reads are memoized across advancing frames only", async () => {
	const fixture = fixtures.find((f) => f.name === "double-24k-datkid")!;
	const src = toMat(await readImage(fixture.framePath));
	const frame = normalizeFrame(src);
	src.delete();
	try {
		const memoizedRows = (event: { debug?: unknown }) =>
			(event.debug as { rows: { memoized: boolean }[] }).rows.map(
				(row) => row.memoized,
			);
		const first = detector.parse(frame, 10)[0]!;
		const repeat = detector.parse(frame, 10.5)[0]!;
		const rewound = detector.parse(frame, 10.5)[0]!;
		assert.deepEqual(memoizedRows(first), [false, false]);
		assert.deepEqual(memoizedRows(repeat), [true, true]);
		assert.deepEqual(memoizedRows(rewound), [false, false]);
		assert.deepEqual(repeat.data, first.data);
		assert.equal(repeat.confidence, first.confidence);
	} finally {
		frame.delete();
	}
});

function skip(fixture: Fixture, field: string): boolean | string {
	return isFieldSkipped(fixture, field) ? "skipFields" : false;
}
