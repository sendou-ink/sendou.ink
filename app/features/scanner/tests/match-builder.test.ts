import assert from "node:assert/strict";
import type {
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { DeathData } from "../core/detectors/death/index";
import type {
	MinimapData,
	MinimapEnemy,
	MinimapTeammate,
} from "../core/detectors/minimap/index";
import { SPECTATOR_SLOTS } from "../core/detectors/minimap/rois";
import type { ObjectiveData } from "../core/detectors/objective/index";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type { ScoreboardReplayData } from "../core/detectors/scoreboard-replay/index";
import type { DetectedEvent } from "../core/detectors/types";
import {
	buildScannerMatches,
	ingestSkipReasons,
	invalidObjectiveEvents,
} from "../core/match-builder";
import type { ScannerAbility, ScannerLobby } from "../scanner-types";
import test from "./node-test-compat";

const NAMES = ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"];
const ALPHA: MainWeaponId[] = [40, 1001, 2010, 3030];
const BRAVO: MainWeaponId[] = [50, 210, 4010, 8000];
const ALL = [...ALPHA, ...BRAVO];

function mapStart(
	t: number,
	{ mode = "SZ" as ModeShort | null, stage = 0 as StageId | null } = {},
): DetectedEvent {
	return { type: "MapStart", t, confidence: 0.9, data: { mode, stage } };
}

function death(
	t: number,
	name: string,
	abilities: ScannerAbility[][] = [["ISM", "ISS", "ISS", "ISS"]],
): DetectedEvent {
	const data: DeathData = {
		weaponId: null,
		weaponType: "MAIN",
		abilities,
		name,
	};
	return { type: "Death", t, confidence: 0.9, data };
}

function objective(
	t: number,
	{
		time = 215 as number | null,
		score = [95, 53] as [number | null, number | null],
		penalty = [null, null] as [number | null, number | null],
		control = [true, false] as [boolean, boolean],
	} = {},
): DetectedEvent {
	const data: ObjectiveData = { mode: "SZ", time, score, penalty, control };
	return { type: "Objective", t, confidence: 0.9, data };
}

function scoreboard(
	t: number,
	{
		lobby = "PRIVATE" as ScannerLobby | null,
		mode = "SZ" as ModeShort | null,
		stage = 0 as StageId | null,
		weapons = ALL as (MainWeaponId | null)[],
		povIndex = 0 as number | null,
		matchScores = [100, 47] as [number | null, number | null],
	} = {},
): DetectedEvent {
	const data: ScoreboardData = {
		lobby,
		mode,
		stage,
		matchScores,
		players: weapons.map((weaponId, i) => ({
			name: NAMES[i] ?? `p${i}`,
			weaponId,
			paint: 1000,
			ka: 10,
			d: 5,
			s: 2,
		})),
		povIndex,
	};
	return { type: "Scoreboard", t, confidence: 0.9, data };
}

function replayScoreboard(
	t: number,
	{
		timestamp = null as string | null,
		replayCode = "RABC-DEFG-HIJK-LMNO" as string | null,
	} = {},
): DetectedEvent & { detectedAt?: number } {
	const base = scoreboard(t).data as ScoreboardData;
	const data: ScoreboardReplayData = {
		...base,
		timestamp,
		replayCode,
		matchScores: [88, 71],
	};
	return { type: "ScoreboardReplay", t, confidence: 0.9, data };
}

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
		spectator = true,
	} = {},
): DetectedEvent {
	const data: MinimapData = {
		stage,
		spectator,
		teammates: alpha.map(teammate),
		enemies: bravo.map(enemy),
	};
	return { type: "Minimap", t, confidence: 0.8, data };
}

function weapons(match: {
	teams: [
		{ players: { weaponId: MainWeaponId | null }[] },
		{ players: { weaponId: MainWeaponId | null }[] },
	];
}): (MainWeaponId | null)[] {
	return match.teams.flatMap((team) =>
		team.players.map((player) => player.weaponId),
	);
}

test("groups map start, deaths and scoreboard into one match", () => {
	const events = [
		mapStart(0),
		death(60, "l2"),
		death(120, "l3"),
		scoreboard(300),
	];
	const built = buildScannerMatches(events);
	assert.equal(built.length, 1);
	assert.deepEqual(
		built[0]!.sources.map((e) => e.type),
		["MapStart", "Death", "Death", "Scoreboard"],
	);
	// sources are the exact input objects
	assert.equal(built[0]!.sources[0], events[0]);
});

test("scoreboard fields land on the match", () => {
	const built = buildScannerMatches([mapStart(0), scoreboard(300)]);
	const match = built[0]!.match;
	assert.equal(match.startsAt, 0);
	assert.equal(match.endsAt, 300);
	assert.equal(match.lobby, "PRIVATE");
	assert.equal(match.mode, "SZ");
	assert.equal(match.stage, 0);
	assert.equal(match.winner, 0);
	assert.deepEqual(match.pov, { team: 0, index: 0 });
	assert.deepEqual(match.matchScores, [100, 47]);
	assert.deepEqual(
		match.teams.map((team) => team.players.map((p) => p.name)),
		[
			["w1", "w2", "w3", "w4"],
			["l1", "l2", "l3", "l4"],
		],
	);
	assert.deepEqual(weapons(match), ALL);
	assert.equal(match.cast, false);
	assert.equal(match.replayCode, null);
	assert.equal(match.objective, null);
});

test("a losing-side pov index maps to the second team", () => {
	const built = buildScannerMatches([scoreboard(300, { povIndex: 6 })]);
	assert.deepEqual(built[0]!.match.pov, { team: 1, index: 2 });
});

test("objective reads become teams-order samples on the match", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(120.4, { time: 215, penalty: [4, null] }),
		objective(180, { time: 155, score: [80, 53] }),
		scoreboard(300),
	]);
	assert.deepEqual(built[0]!.match.objective, {
		mode: "SZ",
		samples: [
			{
				t: 120,
				time: 215,
				score: [95, 53],
				penalty: [4, null],
				control: [true, false],
			},
			{
				t: 180,
				time: 155,
				score: [80, 53],
				penalty: [null, null],
				control: [true, false],
			},
		],
	});
});

test("a losing-side pov swaps objective samples into teams order", () => {
	const built = buildScannerMatches([
		objective(120, { penalty: [4, null] }),
		scoreboard(300, { povIndex: 6 }),
	]);
	assert.deepEqual(built[0]!.match.objective!.samples[0], {
		t: 120,
		time: 215,
		score: [53, 95],
		penalty: [null, 4],
		control: [false, true],
	});
});

test("a known non-SZ match drops its objective reads", () => {
	const events = [
		mapStart(0, { mode: "CB" }),
		objective(60),
		objective(120),
		scoreboard(300, { mode: "CB" }),
	];
	const built = buildScannerMatches(events);
	assert.equal(built[0]!.match.objective, null);
	assert.deepEqual(invalidObjectiveEvents(built), [events[1], events[2]]);
});

test("an unknown-mode match keeps its objective reads", () => {
	const built = buildScannerMatches([
		mapStart(0, { mode: null }),
		objective(60),
		scoreboard(300, { mode: null }),
	]);
	assert.equal(built[0]!.match.objective!.samples.length, 1);
	assert.deepEqual(invalidObjectiveEvents(built), []);
});

test("without a pov the side whose count got lower is the winner side", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(60, { score: [95, 53] }),
		objective(200, { score: [60, 20] }),
		scoreboard(300, { povIndex: null }),
	]);
	assert.deepEqual(
		built[0]!.match.objective!.samples.map((sample) => sample.score),
		[
			[53, 95],
			[20, 60],
		],
	);
});

test("enriches players with abilities from the match's deaths", () => {
	const build: ScannerAbility[][] = [
		["ISM", "ISS", "ISS", "ISS"],
		["QR", "QSJ", "QSJ", "QSJ"],
		["SSU", "RSU", "RSU", "RSU"],
	];
	const built = buildScannerMatches([
		mapStart(0),
		death(60, "l2", build),
		scoreboard(300),
	]);
	const teams = built[0]!.match.teams;
	assert.deepEqual(teams[1].players[1]!.abilities, build);
	assert.equal(teams[0].players[0]!.abilities, undefined);
});

test("deaths from an earlier match do not leak into the next match", () => {
	const built = buildScannerMatches([
		mapStart(0),
		death(60, "l2"),
		scoreboard(300),
		mapStart(400),
		scoreboard(700),
	]);
	assert.equal(built.length, 2);
	assert.equal(built[1]!.match.teams[1].players[1]!.abilities, undefined);
});

test("a scoreboard without a preceding map start claims the last 8 minutes of deaths", () => {
	const built = buildScannerMatches([death(60, "l2"), scoreboard(300)]);
	assert.equal(built.length, 1);
	assert.deepEqual(
		built[0]!.sources.map((e) => e.type),
		["Death", "Scoreboard"],
	);
	assert.notEqual(built[0]!.match.teams[1].players[1]!.abilities, undefined);
});

test("deaths older than 8 minutes do not join a map-start-less match", () => {
	const built = buildScannerMatches([
		death(60, "l2"),
		death(700, "l3"),
		scoreboard(1000),
	]);
	assert.equal(built.length, 1);
	assert.deepEqual(
		built[0]!.sources.map((e) => e.t),
		[700, 1000],
	);
});

test("every event belongs to at most one match", () => {
	const events = [
		death(10, "l2"), // orphan invalidated by the map start
		mapStart(30),
		death(60, "l3"),
		minimap(90),
		scoreboard(300),
		death(320, "l4"), // orphan claimed by the next scoreboard
		scoreboard(700),
		minimap(800),
		minimap(1200), // gap-splits into its own match
		scoreboard(1300),
	];
	const built = buildScannerMatches(events);
	assert.equal(built.length, 4);

	const seen = new Set<DetectedEvent>();
	for (const b of built) {
		for (const source of b.sources) {
			assert.equal(seen.has(source), false);
			seen.add(source);
		}
	}
});

test("the fallback window does not reach past the previous scoreboard", () => {
	const built = buildScannerMatches([
		mapStart(0),
		death(60, "l2"),
		scoreboard(300),
		death(400, "l3"),
		scoreboard(700),
	]);
	assert.equal(built.length, 2);
	assert.deepEqual(
		built[1]!.sources.map((e) => e.t),
		[400, 700],
	);
});

test("non-private lobbies are recorded and skipped on ingest", () => {
	const built = buildScannerMatches([
		mapStart(0),
		scoreboard(300, { lobby: "X" }),
		mapStart(400),
		scoreboard(700),
	]);
	const skipped = ingestSkipReasons(built);
	assert.equal(built.length, 2);
	assert.equal(built[0]!.match.lobby, "X");
	assert.equal(skipped.get(built[0]!), "lobby");
	assert.equal(skipped.get(built[1]!), undefined);
});

test("a scoreless match whose counters had no time to run out is a disconnect", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(140, { time: 183, score: [10, 43], penalty: [69, 0] }),
		scoreboard(155, { matchScores: [null, null] }),
	]);
	assert.equal(built.length, 1);
	assert.equal(ingestSkipReasons(built).get(built[0]!), "disconnect");
});

test("a scoreless match a knockout could have ended is kept", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(140, { time: 30, score: [5, 90], penalty: [0, 0] }),
		scoreboard(200, { matchScores: [null, null] }),
	]);
	assert.equal(built.length, 1);
	assert.equal(ingestSkipReasons(built).size, 0);
});

test("a scoreless match replayed on the same map is a disconnect", () => {
	const built = buildScannerMatches([
		mapStart(0),
		scoreboard(300, { matchScores: [null, null] }),
		mapStart(400),
		scoreboard(700),
	]);
	const skipped = ingestSkipReasons(built);
	assert.equal(built.length, 2);
	assert.equal(skipped.get(built[0]!), "disconnect");
	assert.equal(skipped.get(built[1]!), undefined);
});

test("a scoreless match the next map moves on from is kept", () => {
	const built = buildScannerMatches([
		mapStart(0),
		scoreboard(300, { matchScores: [null, null] }),
		mapStart(400, { stage: 1 }),
		scoreboard(700, { stage: 1 }),
	]);
	assert.equal(built.length, 2);
	assert.equal(ingestSkipReasons(built).size, 0);
});

test("an unreadable lobby is ingestable", () => {
	const built = buildScannerMatches([scoreboard(300, { lobby: null })]);
	assert.equal(built.length, 1);
	assert.equal(ingestSkipReasons(built).size, 0);
});

test("a match whose scoreboard was missed is dropped on the next map start", () => {
	const built = buildScannerMatches([
		mapStart(0),
		death(60, "l2"),
		mapStart(400),
		death(460, "l3"),
		scoreboard(700),
	]);
	assert.equal(built.length, 1);
	assert.deepEqual(
		built[0]!.sources.map((e) => e.t),
		[400, 460, 700],
	);
});

test("a trailing map start with deaths but no scoreboard identifies no match", () => {
	assert.deepEqual(buildScannerMatches([mapStart(0), death(60, "l2")]), []);
});

test("event types that identify no match are ignored", () => {
	const own: DetectedEvent = {
		type: "ScoreboardOwn",
		t: 310,
		confidence: 0.9,
		data: {
			lobby: "PRIVATE",
			mode: null,
			stage: null,
			weaponId: null,
			abilities: [],
		},
	};
	const built = buildScannerMatches([mapStart(0), own, scoreboard(300), own]);
	assert.equal(built.length, 1);
	assert.deepEqual(
		built[0]!.sources.map((e) => e.type),
		["MapStart", "Scoreboard"],
	);
});

test("a replay scoreboard supplies replay code, set score and recording time", () => {
	const event = replayScoreboard(300, { timestamp: "25.12.2025 21:30" });
	event.detectedAt = Date.UTC(2025, 11, 26, 12, 0);
	const built = buildScannerMatches([event]);
	const match = built[0]!.match;
	assert.equal(match.replayCode, "RABC-DEFG-HIJK-LMNO");
	assert.deepEqual(match.matchScores, [88, 71]);
	assert.equal(match.playedAt, new Date(2025, 11, 25, 21, 30).getTime());
});

test("without a replay timestamp, playedAt falls back to the scoreboard's detection time", () => {
	const event = scoreboard(300) as DetectedEvent & { detectedAt?: number };
	event.detectedAt = 1_700_000_000_000;
	const built = buildScannerMatches([event]);
	assert.equal(built[0]!.match.playedAt, 1_700_000_000_000);
});

test("a minimap-only match has no playedAt and no winner", () => {
	const built = buildScannerMatches([minimap(70), minimap(120)]);
	const match = built[0]!.match;
	assert.equal(match.playedAt, null);
	assert.equal(match.winner, null);
	assert.equal(match.pov, null);
	assert.equal(match.matchScores, null);
});

test("a spectator map's minimaps become one cast match: weapons + stage from the minimap, mode unread", () => {
	const built = buildScannerMatches([minimap(70), minimap(120)]);
	assert.equal(built.length, 1);
	const match = built[0]!.match;
	assert.equal(match.startsAt, 70);
	assert.equal(match.endsAt, 120);
	assert.equal(match.mode, null);
	assert.equal(match.stage, 0);
	assert.equal(match.cast, true);
	assert.deepEqual(weapons(match), ALL);
});

test("a pov overlay minimap is not flagged as cast", () => {
	const built = buildScannerMatches([minimap(70, { spectator: false })]);
	assert.equal(built[0]!.match.cast, false);
});

test("a lone misread stage neither splits the match nor poisons its stage", () => {
	const built = buildScannerMatches([
		minimap(70, { stage: 0 }),
		minimap(90, { stage: 1 }),
		minimap(110, { stage: 0 }),
		minimap(130, { stage: 0 }),
	]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.match.stage, 0);
});

test("a confirmed stage change splits even when the misread-looking frame is mid-stream", () => {
	const built = buildScannerMatches([
		minimap(70, { stage: 0 }),
		minimap(90, { stage: 1 }),
		minimap(110, { stage: 1 }),
	]);
	assert.equal(built.length, 2);
	assert.deepEqual(
		built.map((b) => b.match.stage),
		[0, 1],
	);
	assert.deepEqual(
		built.map((b) => b.match.startsAt),
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
	const game2 = [minimap(380), minimap(460)];
	assert.equal(buildScannerMatches([...game1, ...game2]).length, 1);
});

test("a stage change splits minimaps into separate per-map matches", () => {
	const built = buildScannerMatches([
		minimap(70, { stage: 0 }),
		minimap(120, { stage: 0 }),
		minimap(400, { stage: 1 }),
	]);
	assert.equal(built.length, 2);
	assert.deepEqual(
		built.map((b) => b.match.stage),
		[0, 1],
	);
	assert.deepEqual(
		built.map((b) => b.match.startsAt),
		[70, 400],
	);
});

test("a large time gap splits even same-stage minimaps (different games)", () => {
	const built = buildScannerMatches([minimap(70), minimap(90), minimap(600)]);
	assert.equal(built.length, 2);
	assert.deepEqual(
		built.map((b) => b.match.startsAt),
		[70, 600],
	);
});

test("minimaps of one game (close in time, same stage) stay one match", () => {
	const built = buildScannerMatches([minimap(70), minimap(90), minimap(250)]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.match.startsAt, 70);
});

test("weapon slots are merged across a match's minimap frames", () => {
	const frame1 = minimap(70, { alpha: [null, 1001, null, 3030] });
	const frame2 = minimap(90, { alpha: [40, null, 2010, 3030] });
	const built = buildScannerMatches([frame1, frame2]);
	assert.deepEqual(weapons(built[0]!.match), ALL);
});

test("a slot no frame read stays null for consumers to skip on", () => {
	const built = buildScannerMatches([
		minimap(70, { alpha: [40, 1001, 2010, null] }),
	]);
	assert.deepEqual(weapons(built[0]!.match), [40, 1001, 2010, null, ...BRAVO]);
});

test("a MapStart supplies the real mode and opens a match", () => {
	const built = buildScannerMatches([
		mapStart(30, { mode: "RM", stage: 6 }),
		minimap(70, { stage: 6 }),
	]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.match.mode, "RM");
	assert.equal(built[0]!.match.startsAt, 30);
});

test("a scoreboard is the preferred weapon/mode source and closes a match", () => {
	const boardWeapons: (MainWeaponId | null)[] = [
		10, 10, 10, 10, 20, 20, 20, 20,
	];
	const built = buildScannerMatches([
		minimap(70),
		scoreboard(330, { mode: "TC", weapons: boardWeapons }),
	]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.match.mode, "TC");
	assert.deepEqual(weapons(built[0]!.match), boardWeapons);
	assert.equal(built[0]!.match.startsAt, 70);
});

test("no minimaps and no scoreboard means no match", () => {
	assert.deepEqual(buildScannerMatches([mapStart(30), mapStart(400)]), []);
});
