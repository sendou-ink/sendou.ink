/**
 * Golden-file tests for the ObjectiveDetector over every fixture in objective/,
 * plus cross-negative sweeps both ways: the objective gate must stay quiet on
 * every other detector's positives (and the shared negatives), and vice versa.
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
import { createScoreboardBattleLogReplayDetector } from "../core/detectors/scoreboard-battle-log-replay/index";
import { createScoreboardOwnDetector } from "../core/detectors/scoreboard-own/index";
import type { DetectedEvent, Detector } from "../core/detectors/types";
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
const detector = createObjectiveDetector(resources);
const fixtures = loadFixtures("objective");

test("objective fixtures exist", () => {
	assert.ok(fixtures.length > 0, "no fixtures found under objective/");
});

for (const fixture of fixtures) {
	test(`objective/${fixture.name}`, async (t) => {
		const { gate, events: allEvents } = await runDetectorOnFixture(
			detector,
			fixture,
		);
		const events = allEvents.filter(
			(event) => event.type === "Objective",
		) as DetectedEvent<ObjectiveData>[];
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

// The cast fixture pair captures the same game under both camera arrangements
// (the specced team's plate sits left): each frame's two ink hues must separate
// cleanly, and cross-frame the same team's hue must land on the same cluster
// with sides swapped — the invariant match-builder's color orientation rests on.
test("cast fixture pair: team ink hues identify sides across camera swaps", async () => {
	const pair = [
		"splat-zones-cast-specced-purple-left",
		"splat-zones-cast-overhead-purple-right",
	].map((name) => fixtures.find((fixture) => fixture.name === name));
	assert.ok(pair[0] && pair[1], "cast fixture pair missing");

	const colors = [];
	for (const fixture of pair) {
		const { events } = await runDetectorOnFixture(detector, fixture!);
		const teamColor = (
			events.find((event) => event.type === "Objective") as
				| DetectedEvent<ObjectiveData>
				| undefined
		)?.data.teamColor;
		assert.ok(teamColor?.[0] && teamColor[1], "side ink color unreadable");
		colors.push([teamColor[0], teamColor[1]] as const);
	}

	for (const [left, right] of colors) {
		assert.ok(
			hueDistance(hueOf(left), hueOf(right)) >= 90,
			"the two teams' ink hues do not separate",
		);
	}
	const [specced, overhead] = colors;
	assert.ok(hueDistance(hueOf(specced![0]), hueOf(overhead![1])) <= 20);
	assert.ok(hueDistance(hueOf(specced![1]), hueOf(overhead![0])) <= 20);
});

// Screens that replace gameplay can never show the counters — the gate must
// stay quiet on their positives.
const otherPositiveSets = [
	["scoreboard", "Scoreboard"],
	["scoreboard-battle-log-replay", "ScoreboardBattleLogReplay"],
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

// No sweep over death positives: the death overlay rides live gameplay whose
// counter HUD stays visible (several death fixtures show readable plates), so
// no quiet can be promised there. Death frames with counters make fine fixtures.

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
		"scoreboard-battle-log-replay",
		createScoreboardBattleLogReplayDetector(resources) as Detector<unknown>,
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
