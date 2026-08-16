import assert from "node:assert/strict";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	StageId,
} from "~/modules/in-game-lists/types";
import { withoutRepeatEvents } from "../../components/dedupe-events";
import type { DeathData } from "../../core/detectors/death/index";
import type {
	MinimapData,
	MinimapEnemy,
	MinimapTeammate,
} from "../../core/detectors/minimap/index";
import { SPECTATOR_SLOTS } from "../../core/detectors/minimap/rois";
import type { DetectedEvent } from "../../core/detectors/types";
import test from "../node-test-compat";

const ALPHA: MainWeaponId[] = [40, 1001, 2010, 3030];
const BRAVO: MainWeaponId[] = [50, 210, 4010, 8000];

function teammate(
	weaponId: MainWeaponId | null,
	i: number,
	{
		name = null as string | null,
		abilities = [] as (AbilityWithUnknown | null)[],
		dead = false,
	} = {},
): MinimapTeammate {
	return {
		slot: SPECTATOR_SLOTS[i]!,
		name,
		weaponId,
		abilities,
		dead,
		specialReady: false,
	};
}

function enemy(
	weaponId: MainWeaponId | null,
	{ name = null as string | null } = {},
): MinimapEnemy {
	return { name, weaponId, abilities: [], dead: false, specialReady: false };
}

function minimap(
	t: number,
	{
		stage = 0 as StageId | null,
		teammates = ALPHA.map((id, i) => teammate(id, i)),
		enemies = BRAVO.map((id) => enemy(id)),
	} = {},
): DetectedEvent {
	const data: MinimapData = {
		stage,
		spectator: true,
		teammates,
		enemies,
		teamColors: [null, null],
	};
	return { type: "Minimap", t, confidence: 0.8, data };
}

function death(t: number): DetectedEvent {
	const data: DeathData = {
		weaponId: null,
		weaponType: "MAIN",
		abilities: [],
		name: null,
	};
	return { type: "Death", t, confidence: 0.9, data };
}

test("collapses a repeated minimap into the first occurrence", () => {
	const kept = withoutRepeatEvents([minimap(70), minimap(73), minimap(76)]);
	assert.equal(kept.length, 1);
	assert.equal(kept[0]!.t, 70);
});

test("a name-only difference is still a repeat (OCR wobble)", () => {
	const kept = withoutRepeatEvents([
		minimap(70, { enemies: BRAVO.map((id) => enemy(id, { name: "クレー" })) }),
		minimap(73, { enemies: BRAVO.map((id) => enemy(id, { name: "グレー" })) }),
	]);
	assert.equal(kept.length, 1);
});

test("a changed ability read keeps both minimaps", () => {
	const kept = withoutRepeatEvents([
		minimap(70),
		minimap(73, {
			teammates: ALPHA.map((id, i) =>
				teammate(id, i, { abilities: i === 0 ? ["ISM"] : [] }),
			),
		}),
	]);
	assert.equal(kept.length, 2);
});

test("a changed dead state keeps both minimaps", () => {
	const kept = withoutRepeatEvents([
		minimap(70),
		minimap(73, {
			teammates: ALPHA.map((id, i) => teammate(id, i, { dead: i === 0 })),
		}),
	]);
	assert.equal(kept.length, 2);
});

test("dedupes across interleaved events of other types, dropping none of them", () => {
	const kept = withoutRepeatEvents([minimap(70), death(72), minimap(74)]);
	assert.deepEqual(
		kept.map((e) => e.type),
		["Minimap", "Death"],
	);
});
