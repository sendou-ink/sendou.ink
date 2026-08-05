import assert from "node:assert/strict";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type {
	MinimapData,
	MinimapEnemy,
	MinimapTeammate,
} from "../core/detectors/minimap/index";
import { SPECTATOR_SLOTS } from "../core/detectors/minimap/rois";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type { DetectedEvent } from "../core/detectors/types";
import { buildVodMatches } from "../core/vod-matches";
import test from "./node-test-compat";

const ALPHA: MainWeaponId[] = [40, 1001, 2010, 3030];
const BRAVO: MainWeaponId[] = [50, 210, 4010, 8000];
const ALL = [...ALPHA, ...BRAVO];

function teammate(weaponId: MainWeaponId | null, i: number): MinimapTeammate {
	return {
		slot: SPECTATOR_SLOTS[i]!,
		name: null,
		weaponId,
		abilities: [],
	};
}

function enemy(weaponId: MainWeaponId | null): MinimapEnemy {
	return {
		name: null,
		weaponId,
		abilities: [],
	};
}

function minimap(
	t: number,
	{
		stage = 0 as StageId | null,
		alpha = ALPHA as (MainWeaponId | null)[],
		bravo = BRAVO as (MainWeaponId | null)[],
	} = {},
): DetectedEvent {
	const data: MinimapData = {
		stage,
		spectator: true,
		teammates: alpha.map(teammate),
		enemies: bravo.map(enemy),
	};
	return { type: "Minimap", t, confidence: 0.8, data };
}

function mapStart(
	t: number,
	{ mode = "SZ" as ModeShort | null, stage = 0 as StageId | null } = {},
): DetectedEvent {
	return { type: "MapStart", t, confidence: 0.9, data: { mode, stage } };
}

function scoreboard(
	t: number,
	{
		mode = "SZ" as ModeShort | null,
		stage = 0 as StageId | null,
		weapons = ALL as (MainWeaponId | null)[],
	} = {},
): DetectedEvent {
	const data: ScoreboardData = {
		lobby: "PRIVATE",
		mode,
		stage,
		scores: [100, 47],
		players: weapons.map((weaponId, i) => ({
			name: `p${i}`,
			weaponId,
			paint: 1000,
			ka: 10,
			d: 5,
			s: 2,
		})),
		povIndex: null,
	};
	return { type: "Scoreboard", t, confidence: 0.9, data };
}

test("a spectator map's minimaps become one match: weapons + stage from the minimap, mode defaulted", () => {
	const matches = buildVodMatches([minimap(70), minimap(120)]);
	assert.equal(matches.length, 1);
	assert.deepEqual(matches[0], {
		startsAt: 70,
		mode: "SZ", // PoC default — the minimap can't read mode
		modeAssumed: true,
		stage: 0,
		weapons: ALL,
	});
});

test("a real mode read is not flagged as assumed", () => {
	const matches = buildVodMatches([mapStart(30, { mode: "RM" }), minimap(70)]);
	assert.equal(matches[0]!.mode, "RM");
	assert.equal(matches[0]!.modeAssumed, false);
});

test("a lone misread stage neither splits the match nor poisons its stage", () => {
	// the Eeltail frame disagrees with the running stage AND is refuted by
	// the next read, so it folds in as a minority vote: one match, majority
	// stage, its weapons still contributing to the slot merge
	const matches = buildVodMatches([
		minimap(70, { stage: 0 }),
		minimap(90, { stage: 1 }),
		minimap(110, { stage: 0 }),
		minimap(130, { stage: 0 }),
	]);
	assert.equal(matches.length, 1);
	assert.equal(matches[0]!.stage, 0);
});

test("a confirmed stage change splits even when the misread-looking frame is mid-stream", () => {
	const matches = buildVodMatches([
		minimap(70, { stage: 0 }),
		minimap(90, { stage: 1 }),
		minimap(110, { stage: 1 }),
	]);
	assert.equal(matches.length, 2);
	assert.deepEqual(
		matches.map((m) => m.stage),
		[0, 1],
	);
	assert.deepEqual(
		matches.map((m) => m.startsAt),
		[70, 90],
	);
});

// KNOWN LIMITATION (documented, not desired): two consecutive games on the
// SAME stage with a between-games break shorter than MATCH_GAP_SECONDS merge
// into one match — no native UI delimits them on casted footage and the
// simplified minimap carries no signal to split on. Real mode/game detection
// should replace this.
test("same-stage rematch within the gap window merges into one match (known limitation)", () => {
	const game1 = [minimap(70), minimap(150)];
	const game2 = [minimap(380), minimap(460)]; // 230s after game 1's last open
	const matches = buildVodMatches([...game1, ...game2]);
	assert.equal(matches.length, 1);
});

test("a stage change splits minimaps into separate per-map matches", () => {
	const matches = buildVodMatches([
		minimap(70, { stage: 0 }),
		minimap(120, { stage: 0 }),
		minimap(400, { stage: 1 }),
	]);
	assert.equal(matches.length, 2);
	assert.deepEqual(
		matches.map((m) => m.stage),
		[0, 1],
	);
	assert.deepEqual(
		matches.map((m) => m.startsAt),
		[70, 400],
	);
});

test("a large time gap splits even same-stage minimaps (different games)", () => {
	const matches = buildVodMatches([minimap(70), minimap(90), minimap(600)]);
	assert.equal(matches.length, 2);
	assert.deepEqual(
		matches.map((m) => m.startsAt),
		[70, 600],
	);
});

test("minimaps of one game (close in time, same stage) stay one match", () => {
	const matches = buildVodMatches([minimap(70), minimap(90), minimap(250)]);
	assert.equal(matches.length, 1);
	assert.equal(matches[0]!.startsAt, 70);
});

test("weapon slots are merged across a match's minimap frames", () => {
	const frame1 = minimap(70, { alpha: [null, 1001, null, 3030] });
	const frame2 = minimap(90, { alpha: [40, null, 2010, 3030] });
	const matches = buildVodMatches([frame1, frame2]);
	assert.deepEqual(matches[0]!.weapons, ALL);
});

test("a slot no frame read stays null for the endpoint to skip on", () => {
	const matches = buildVodMatches([
		minimap(70, { alpha: [40, 1001, 2010, null] }),
	]);
	assert.deepEqual(matches[0]!.weapons, [40, 1001, 2010, null, ...BRAVO]);
});

test("a MapStart supplies the real mode and opens a match", () => {
	const matches = buildVodMatches([
		mapStart(30, { mode: "RM", stage: 6 }),
		minimap(70, { stage: 6 }),
	]);
	assert.equal(matches.length, 1);
	assert.equal(matches[0]!.mode, "RM");
	assert.equal(matches[0]!.startsAt, 30);
});

test("a scoreboard is the preferred weapon/mode source and closes a match", () => {
	const boardWeapons: (MainWeaponId | null)[] = [
		10, 10, 10, 10, 20, 20, 20, 20,
	];
	const matches = buildVodMatches([
		minimap(70),
		scoreboard(330, { mode: "TC", weapons: boardWeapons }),
	]);
	assert.equal(matches.length, 1);
	assert.equal(matches[0]!.mode, "TC");
	assert.deepEqual(matches[0]!.weapons, boardWeapons);
	assert.equal(matches[0]!.startsAt, 70); // first minimap open
});

test("no minimaps and no scoreboard means no match", () => {
	assert.deepEqual(buildVodMatches([mapStart(30), mapStart(400)]), []);
});
