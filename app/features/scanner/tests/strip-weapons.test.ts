/**
 * Golden-file tests for the StripWeapons evidence event: every alive slot's
 * top candidate is its weapon, and the votes aggregated across one
 * sendou-triton VoD game's fixtures (its results screen attests both row
 * orders) assign every slot to its scoreboard row.
 */

import assert from "node:assert/strict";
import { loadOpenCV } from "../core/cv";
import { createObjectiveDetector } from "../core/detectors/objective/index";
import {
	STRIP_WEAPONS_EVENT_TYPE,
	type StripWeaponsData,
} from "../core/detectors/objective/strip-weapons";
import type { DetectedEvent } from "../core/detectors/types";
import {
	addWeaponEvidence,
	emptySlotRowEvidence,
	slotRowPermutation,
} from "../core/slot-row-assignment";
import {
	fieldTestOptions,
	loadFixtures,
	runDetectorOnFixture,
} from "../node/fixtures";
import { loadScoreboardResources } from "../node/resources";
import { test } from "./node-test-compat";

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

		for (const side of [0, 1] as const) {
			for (const slot of [0, 1, 2, 3] as const) {
				const truth = expected.weapons?.[side]?.[slot];
				await t.test(
					`slot[${side}][${slot}]`,
					fieldTestOptions(
						fixture,
						`weapons.${side}.${slot}`,
						truth !== undefined,
					),
					() => {
						const candidates = event.data.slots[side][slot];
						if (truth === null) {
							assert.equal(candidates, null, "splatted slot should be skipped");
						} else {
							assert.equal(candidates?.[0]?.weaponId, truth);
						}
					},
				);
			}
		}
	});
}

// The Mahi-Mahi game's fixtures. Row orders attested on the results screen: left/losing side rows
// [Snipewriter 5H, Custom Blaster, Splattershot Jr., Splat Roller] vs strip
// seating [Snipewriter, Jr, Custom Blaster, Roller]; right/winning side rows
// [.52 Gal, Neo Splash-o-matic, Snipewriter 5H, Planetz Big Swig Roller] vs
// seating [Planetz, .52, Neo Splash, Snipewriter].
test("aggregated votes assign every slot to its scoreboard row", () => {
	assert.ok(
		[...parsed.keys()].filter((name) => name.startsWith("triton-mahi-"))
			.length >= 2,
		"needs at least two parsed fixtures",
	);
	const rowWeapons = [
		[2070, 211, 10, 1010],
		[50, 21, 2070, 1042],
	] as const;
	const evidence = [emptySlotRowEvidence(), emptySlotRowEvidence()];
	for (const [name, event] of parsed.entries()) {
		if (!name.startsWith("triton-mahi-")) continue;
		for (const side of [0, 1] as const) {
			for (const [slot, candidates] of event.data.slots[side].entries()) {
				const floor = candidates?.at(-1)?.score ?? 0;
				for (const candidate of candidates ?? []) {
					addWeaponEvidence(
						evidence[side]!,
						slot,
						candidate.weaponId,
						candidate.score - floor,
						rowWeapons[side],
					);
				}
			}
		}
	}
	assert.deepEqual(slotRowPermutation(evidence[0]!), [0, 2, 1, 3]);
	assert.deepEqual(slotRowPermutation(evidence[1]!), [3, 0, 1, 2]);
});
