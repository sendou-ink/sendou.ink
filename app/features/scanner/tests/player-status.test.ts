/**
 * Golden-file tests for the PlayerStatus event over every fixture in
 * player-status/, mirroring objective.test.ts. The event is emitted by the
 * ObjectiveDetector alongside each counter read — a positive fixture must
 * produce both events off one parse, with the icon-strip statuses and the
 * shared timer matching the hand-corrected labels. Other detectors' gates
 * must stay quiet on these frames (they show live gameplay HUD, which only
 * the objective family may claim — death excepted, see objective.test.ts).
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../core/cv";
import { createDeathDetector } from "../core/detectors/death/index";
import { createMapStartDetector } from "../core/detectors/map-start/index";
import { createMinimapDetector } from "../core/detectors/minimap/index";
import { createObjectiveDetector } from "../core/detectors/objective/index";
import {
	PLAYER_STATUS_EVENT_TYPE,
	type PlayerStatusData,
} from "../core/detectors/objective/player-status";
import { createScoreboardDetector } from "../core/detectors/scoreboard/index";
import { createScoreboardBattleLogReplayDetector } from "../core/detectors/scoreboard-battle-log-replay/index";
import { createScoreboardOwnDetector } from "../core/detectors/scoreboard-own/index";
import type { DetectedEvent, Detector } from "../core/detectors/types";
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
const fixtures = loadFixtures("player-status");

test("player-status fixtures exist", () => {
	assert.ok(fixtures.length > 0, "no fixtures found under player-status/");
});

for (const fixture of fixtures) {
	test(`player-status/${fixture.name}`, async (t) => {
		// fresh detector per fixture: the objective detector carries sticky
		// layout state across reads, and fixtures are unrelated frames
		const { gate, events } = await runDetectorOnFixture(
			createObjectiveDetector(resources),
			fixture,
		);
		const expectPositive = fixture.expected.event === "PlayerStatus";

		await t.test("gate", () => {
			assert.equal(
				gate.pass,
				expectPositive,
				`gate ${gate.pass ? "fired" : "did not fire"} (score=${gate.score.toFixed(3)}), expected ${expectPositive ? "fire" : "no fire"}`,
			);
		});

		if (!expectPositive) return;
		const event = events.find((e) => e.type === PLAYER_STATUS_EVENT_TYPE) as
			| DetectedEvent<PlayerStatusData>
			| undefined;
		assert.ok(
			event,
			gate.pass
				? "gate passed but no PlayerStatus event (counter unreadable?)"
				: "no event (gate did not fire)",
		);
		const expected = fixture.expected.data ?? {};
		const debug = () => JSON.stringify(event.debug);

		await t.test(
			"layout",
			{ skip: expected.layout === undefined || skip(fixture, "layout") },
			() => {
				assert.equal(event.data.layout, expected.layout);
			},
		);

		await t.test(
			"cast",
			{ skip: expected.cast === undefined || skip(fixture, "cast") },
			() => {
				assert.equal(event.data.cast, expected.cast);
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
			for (const slot of [0, 1, 2, 3] as const) {
				await t.test(
					`special[${side}][${slot}]`,
					{
						skip:
							expected.special === undefined ||
							skip(fixture, `special.${side}.${slot}`),
					},
					() => {
						assert.equal(
							event.data.special[side][slot],
							expected.special![side]![slot],
							`special[${side}][${slot}] mismatch (${debug()})`,
						);
					},
				);
				await t.test(
					`dead[${side}][${slot}]`,
					{
						skip:
							expected.dead === undefined ||
							skip(fixture, `dead.${side}.${slot}`),
					},
					() => {
						assert.equal(
							event.data.dead[side][slot],
							expected.dead![side]![slot],
							`dead[${side}][${slot}] mismatch (${debug()})`,
						);
					},
				);
			}
		}
	});
}

// The status strip only exists on the live-gameplay HUD, which replaces no
// other detector's screen — their gates must stay quiet on these frames
// (death excepted: its overlay rides live gameplay, see objective.test.ts).
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
	(f) => f.expected.event === "PlayerStatus",
)) {
	test(`other gates stay quiet on player-status/${fixture.name}`, async () => {
		for (const [name, other] of otherDetectors) {
			if (name === "death") continue;
			const { gate } = await runDetectorOnFixture(other, fixture);
			assert.equal(
				gate.pass,
				false,
				`${name} gate fired (score=${gate.score.toFixed(3)})`,
			);
		}
	});
}

// Shared negatives: the objective gate guards PlayerStatus emission too,
// and objective.test.ts already sweeps it over negative/ — no repeat here.

function skip(fixture: Fixture, field: string): boolean | string {
	return isFieldSkipped(fixture, field) ? "skipFields" : false;
}
