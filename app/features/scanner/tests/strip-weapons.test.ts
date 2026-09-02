/**
 * Golden-file tests for the StripWeapons evidence event. Single reads are
 * deliberately weak (the true weapon ranks top-1 about half the time), so
 * per-slot assertions stay structural and the accuracy assertion is the one
 * production relies on: votes aggregated across the fixtures (frames of one
 * sendou-triton VoD match, whose results screen attests both row orders)
 * assign every slot to its scoreboard row.
 */

import assert from "node:assert/strict";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { loadOpenCV } from "../core/cv";
import { createObjectiveDetector } from "../core/detectors/objective/index";
import {
	STRIP_WEAPONS_EVENT_TYPE,
	type StripWeaponsData,
} from "../core/detectors/objective/strip-weapons";
import type { DetectedEvent } from "../core/detectors/types";
import { weaponSlotRowPermutation } from "../core/slot-row-assignment";
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
const fixtures = loadFixtures("strip-weapons");

test("strip-weapons fixtures exist", () => {
	assert.ok(fixtures.length > 0, "no fixtures found under strip-weapons/");
});

const parsed = new Map<string, DetectedEvent<StripWeaponsData>>();

for (const fixture of fixtures) {
	test(`strip-weapons/${fixture.name}`, async (t) => {
		const { gate, events } = await runDetectorOnFixture(
			createObjectiveDetector(resources),
			fixture,
		);
		assert.ok(gate.pass, `objective gate did not fire (${gate.score})`);
		const event = events.find((e) => e.type === STRIP_WEAPONS_EVENT_TYPE) as
			| DetectedEvent<StripWeaponsData>
			| undefined;
		assert.ok(event, "no StripWeapons event alongside the counter read");
		parsed.set(fixture.name, event);
		const expected = fixture.expected.data ?? {};

		await t.test(
			"layout",
			{ skip: expected.layout === undefined || skip(fixture, "layout") },
			() => {
				assert.equal(event.data.layout, expected.layout);
			},
		);

		for (const side of [0, 1] as const) {
			for (const slot of [0, 1, 2, 3] as const) {
				const truth = expected.weapons?.[side]?.[slot];
				await t.test(
					`slot[${side}][${slot}]`,
					{
						skip:
							truth === undefined || skip(fixture, `weapons.${side}.${slot}`),
					},
					() => {
						const candidates = event.data.slots[side][slot];
						if (truth === null) {
							assert.equal(candidates, null, "splatted slot should be skipped");
						} else {
							assert.ok(candidates, "alive slot should carry candidates");
							assert.ok(candidates.length > 0, "empty candidate list");
						}
					},
				);
			}
		}
	});
}

// The assertion production leans on: aggregated across the match's reads, each
// side's best-of-24 assignment places every slot. Row orders attested on the
// results screen: left/losing side rows [Snipewriter 5H, Custom Blaster,
// Splattershot Jr., Splat Roller] vs strip seating [Snipewriter, Jr, Custom
// Blaster, Roller]; right/winning side rows [.52 Gal, Neo Splash-o-matic,
// Snipewriter 5H, Planetz Big Swig Roller] vs seating [Planetz, .52, Neo Splash, Snipewriter].
test("aggregated votes assign every slot to its scoreboard row", () => {
	assert.ok(parsed.size >= 2, "needs at least two parsed fixtures");
	const votes = [0, 1].map(() =>
		[0, 1, 2, 3].map(() => new Map<MainWeaponId, number>()),
	);
	for (const event of parsed.values()) {
		for (const side of [0, 1] as const) {
			for (const [slot, candidates] of event.data.slots[side].entries()) {
				for (const candidate of candidates ?? []) {
					const slotVotes = votes[side]![slot]!;
					slotVotes.set(
						candidate.weaponId,
						(slotVotes.get(candidate.weaponId) ?? 0) + candidate.score,
					);
				}
			}
		}
	}
	assert.deepEqual(
		weaponSlotRowPermutation(votes[0]!, [2070, 211, 10, 1010]),
		[0, 2, 1, 3],
	);
	assert.deepEqual(
		weaponSlotRowPermutation(votes[1]!, [50, 21, 2070, 1042]),
		[3, 0, 1, 2],
	);
});

function skip(fixture: Fixture, field: string): boolean | string {
	return isFieldSkipped(fixture, field) ? "skipFields" : false;
}
