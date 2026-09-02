import assert from "node:assert/strict";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { DeathData } from "../../core/detectors/death/index";
import type {
	MinimapData,
	MinimapEnemy,
	MinimapTeammate,
} from "../../core/detectors/minimap/index";
import { SPECTATOR_SLOTS } from "../../core/detectors/minimap/rois";
import type { ObjectiveData } from "../../core/detectors/objective/index";
import type { PlayerStatusData } from "../../core/detectors/objective/player-status";
import type { StripWeaponsData } from "../../core/detectors/objective/strip-weapons";
import type { ScoreboardData } from "../../core/detectors/scoreboard/index";
import type { ScoreboardBattleLogData } from "../../core/detectors/scoreboard-battle-log/index";
import type { ScoreboardBattleLogReplayData } from "../../core/detectors/scoreboard-battle-log-replay/index";
import type { DetectedEvent } from "../../core/detectors/types";
import {
	buildScannerMatches,
	ingestSkipReasons,
	invalidObjectiveEvents,
} from "../../core/match-builder";
import type { ScannerLobby } from "../../scanner-types";
import test from "../node-test-compat";

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
	abilities: AbilityWithUnknown[][] = [["ISM", "ISS", "ISS", "ISS"]],
): DetectedEvent {
	const data: DeathData = {
		weaponId: null,
		weaponType: "MAIN",
		abilities,
		name,
	};
	return { type: "Death", t, confidence: 0.9, data };
}

// default timer stays consistent with t (clock zero projected at 300s of
// footage) so reads register as one live game to the replay filter
function objective(
	t: number,
	{
		time = (300 - Math.round(t)) as number | null,
		score = [95, 53] as [number | null, number | null],
		penalty = [null, null] as [number | null, number | null],
		control = [true, false] as [boolean, boolean],
		teamColor = [null, null] as ObjectiveData["teamColor"],
	} = {},
): DetectedEvent {
	const data: ObjectiveData = {
		mode: "SZ",
		time,
		score,
		penalty,
		control,
		teamColor,
	};
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
	const data: ScoreboardBattleLogReplayData = {
		...base,
		timestamp,
		replayCode,
		matchScores: [88, 71],
	};
	return { type: "ScoreboardBattleLogReplay", t, confidence: 0.9, data };
}

function battleLogScoreboard(
	t: number,
	{ timestamp = null as string | null } = {},
): DetectedEvent & { detectedAt?: number } {
	const base = scoreboard(t).data as ScoreboardData;
	const data: ScoreboardBattleLogData = {
		...base,
		timestamp,
		matchScores: [100, 0],
	};
	return { type: "ScoreboardBattleLog", t, confidence: 0.9, data };
}

function teammate(weaponId: MainWeaponId | null, i: number): MinimapTeammate {
	return {
		slot: SPECTATOR_SLOTS[i]!,
		name: null,
		weaponId,
		abilities: [],
		dead: false,
		specialReady: false,
	};
}

function enemy(weaponId: MainWeaponId | null): MinimapEnemy {
	return {
		name: null,
		weaponId,
		abilities: [],
		dead: false,
		specialReady: false,
	};
}

function minimap(
	t: number,
	{
		stage = 0 as StageId | null,
		alpha = ALPHA as (MainWeaponId | null)[],
		bravo = BRAVO as (MainWeaponId | null)[],
		spectator = true,
		teamColors = [null, null] as MinimapData["teamColors"],
		dead = [[], []] as [number[], number[]],
		specialReady = [[], []] as [number[], number[]],
	} = {},
): DetectedEvent {
	const data: MinimapData = {
		stage,
		spectator,
		teammates: alpha.map((id, i) => ({
			...teammate(id, i),
			dead: dead[0].includes(i),
			specialReady: specialReady[0].includes(i),
		})),
		enemies: bravo.map((id, i) => ({
			...enemy(id),
			dead: dead[1].includes(i),
			specialReady: specialReady[1].includes(i),
		})),
		teamColors,
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
		time: 180,
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

const GREEN_INK = { r: 146, g: 180, b: 96 };
const PURPLE_INK = { r: 130, g: 43, b: 130 };

test("casted plate swaps are reoriented by team ink color", () => {
	const built = buildScannerMatches([
		minimap(0, { teamColors: [GREEN_INK, PURPLE_INK] }),
		objective(60, {
			score: [80, 90],
			control: [true, false],
			teamColor: [GREEN_INK, PURPLE_INK],
		}),
		// the caster specs a purple player: purple's plate moves left
		objective(120, {
			score: [90, 75],
			penalty: [4, null],
			control: [true, false],
			teamColor: [PURPLE_INK, GREEN_INK],
		}),
		// colors unreadable: the previous arrangement carries over
		objective(125, {
			score: [85, 75],
			control: [true, false],
			teamColor: [null, null],
		}),
		minimap(180),
	]);
	assert.equal(built.length, 1);
	const samples = built[0]!.match.objective!.samples;
	assert.deepEqual(
		samples.map((sample) => sample.score),
		[
			[80, 90],
			[75, 90],
			[75, 85],
		],
	);
	assert.deepEqual(
		samples.map((sample) => sample.penalty),
		[
			[null, null],
			[null, 4],
			[null, null],
		],
	);
	assert.deepEqual(
		samples.map((sample) => sample.control),
		[
			[true, false],
			[false, true],
			[false, true],
		],
	);
});

test("minimap ink colors anchor a bravo-first cluster into teams order", () => {
	const built = buildScannerMatches([
		minimap(0, { teamColors: [GREEN_INK, PURPLE_INK] }),
		// every read had purple (bravo) on the left plate
		objective(60, {
			score: [90, 80],
			control: [false, true],
			teamColor: [PURPLE_INK, GREEN_INK],
		}),
		minimap(120),
	]);
	const samples = built[0]!.match.objective!.samples;
	assert.deepEqual(samples[0]!.score, [80, 90]);
	assert.deepEqual(samples[0]!.control, [true, false]);
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

test("a transient score dip is voided against the surrounding countdown", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(60, { score: [54, 100] }),
		// truncated misread of "50" — only the trailing 0 was read
		objective(61, { score: [0, 100], penalty: [4, null] }),
		objective(62, { score: [49, 100] }),
		objective(63, { score: [47, 100] }),
		scoreboard(300),
	]);
	const samples = built[0]!.match.objective!.samples;
	assert.deepEqual(
		samples.map((sample) => sample.score),
		[
			[54, 100],
			[null, 100],
			[49, 100],
			[47, 100],
		],
	);
	assert.deepEqual(samples[1]!.penalty, [4, null]);
});

test("post-game replay wipes are dropped by their clock projection", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(60, { score: [80, 6], penalty: [null, 56] }),
		objective(61, { score: [78, 6], penalty: [null, 56] }),
		objective(62, { score: [77, 6], penalty: [null, 56] }),
		// broadcast re-runs the opening moments, clock jumped back to 4:51
		objective(90, { time: 291, score: [100, 100] }),
		objective(91, { time: 290, score: [99, 100] }),
		// then the closing moments again
		objective(100, { time: 62, score: [6, 77], penalty: [56, null] }),
		objective(101, { time: 61, score: [6, 75], penalty: [56, null] }),
		scoreboard(300),
	]);
	const samples = built[0]!.match.objective!.samples;
	assert.deepEqual(
		samples.map((sample) => sample.t),
		[60, 61, 62],
	);
	assert.deepEqual(samples.at(-1)!.penalty, [null, 56]);
});

test("timerless reads share their live neighbor's replay-filter fate", () => {
	const built = buildScannerMatches([
		mapStart(0),
		// timerless head inherits from the first anchored read
		objective(59, { time: null, score: [82, 6] }),
		objective(60, { score: [80, 6] }),
		objective(61, { score: [79, 6] }),
		objective(62, { time: null, score: [78, 6] }),
		// replay wipe, including a timerless read inside it
		objective(90, { time: 291, score: [100, 100] }),
		objective(91, { time: null, score: [99, 100] }),
		objective(92, { time: 289, score: [97, 100] }),
		scoreboard(300),
	]);
	assert.deepEqual(
		built[0]!.match.objective!.samples.map((sample) => sample.t),
		[59, 60, 61, 62],
	);
});

test("a stray full-count blip is voided against the surrounding countdown", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(60, { score: [80, 100] }),
		objective(61, { score: [100, 100] }),
		objective(62, { score: [75, 100] }),
		objective(63, { score: [73, 100] }),
		scoreboard(300),
	]);
	assert.deepEqual(
		built[0]!.match.objective!.samples.map((sample) => sample.score),
		[
			[80, 100],
			[null, 100],
			[75, 100],
			[73, 100],
		],
	);
});

test("enriches players with abilities from the match's deaths", () => {
	const build: AbilityWithUnknown[][] = [
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

test("a battle log scoreboard closes a match and supplies the recording time without a replay code", () => {
	const event = battleLogScoreboard(300, { timestamp: "25.12.2025 21:30" });
	event.detectedAt = Date.UTC(2025, 11, 26, 12, 0);
	const built = buildScannerMatches([event]);
	const match = built[0]!.match;
	assert.equal(match.replayCode, null);
	assert.deepEqual(match.matchScores, [100, 0]);
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

test("a narrow-left strip layout alone is not flagged as cast", () => {
	const built = buildScannerMatches([
		minimap(70, { spectator: false }),
		playerStatus(75, { layout: "narrow-left" }),
		playerStatus(76, { layout: "narrow-left" }),
		minimap(120, { spectator: false }),
	]);
	assert.equal(built[0]!.match.cast, false);
});

test("a badge-proven strip read flags the match as cast", () => {
	const built = buildScannerMatches([
		minimap(70, { spectator: false }),
		playerStatus(75, { layout: "narrow-left", cast: true }),
		minimap(120, { spectator: false }),
	]);
	assert.equal(built[0]!.match.cast, true);
});

test("a results-screen pov seat vetoes misread cast evidence", () => {
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(120, { cast: true }),
		scoreboard(300),
	]);
	const match = built[0]!.match;
	assert.equal(match.cast, false);
	assert.deepEqual(match.pov, { team: 0, index: 0 });
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

// KNOWN LIMITATION: two consecutive games on the SAME stage with a break
// shorter than MATCH_GAP_SECONDS merge into one match — casted footage has no
// native delimiter and the minimap carries no signal to split on.
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

const ALL_FALSE = [
	[false, false, false, false],
	[false, false, false, false],
] as PlayerStatusData["special"];

function playerStatus(
	t: number,
	{
		time = (300 - Math.round(t)) as number | null,
		special = ALL_FALSE,
		dead = ALL_FALSE,
		layout = "even" as PlayerStatusData["layout"],
		cast = null as true | null,
	} = {},
): DetectedEvent {
	const data: PlayerStatusData = { time, special, dead, layout, cast };
	return { type: "PlayerStatus", t, confidence: 0.9, data };
}

function stripWeaponsEvent(
	t: number,
	slots: [(MainWeaponId | null)[], (MainWeaponId | null)[]],
	{ score = 0.6, time = (300 - Math.round(t)) as number | null } = {},
): DetectedEvent {
	const data: StripWeaponsData = {
		time,
		layout: "narrow-right",
		slots: slots.map((side) =>
			side.map((weaponId) =>
				weaponId === null ? null : [{ weaponId, score }],
			),
		) as StripWeaponsData["slots"],
	};
	return { type: "StripWeapons", t, confidence: score, data };
}

test("player-status reads become teams-order samples on the match", () => {
	const special = [
		[true, false, false, false],
		[false, false, false, false],
	] as PlayerStatusData["special"];
	const dead = [
		[false, false, false, false],
		[false, false, true, false],
	] as PlayerStatusData["dead"];
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(120, { special, dead }),
		scoreboard(300),
	]);
	assert.deepEqual(built[0]!.match.playerStatus, {
		samples: [{ t: 120, time: 180, special, dead }],
	});
});

test("a losing-side pov swaps player-status samples into teams order", () => {
	const built = buildScannerMatches([
		playerStatus(120, {
			special: [
				[true, false, false, false],
				[false, false, false, false],
			],
			dead: [
				[false, false, false, false],
				[false, true, false, false],
			],
		}),
		scoreboard(300, { povIndex: 5 }),
	]);
	const sample = built[0]!.match.playerStatus!.samples[0]!;
	assert.deepEqual(sample.special, [
		[false, false, false, false],
		[true, false, false, false],
	]);
	assert.deepEqual(sample.dead, [
		[false, true, false, false],
		[false, false, false, false],
	]);
});

test("status reads inherit the nearest counter read's cast orientation", () => {
	const built = buildScannerMatches([
		minimap(0, { teamColors: [GREEN_INK, PURPLE_INK] }),
		objective(60, {
			score: [80, 90],
			teamColor: [GREEN_INK, PURPLE_INK],
		}),
		playerStatus(60, {
			dead: [
				[true, false, false, false],
				[false, false, false, false],
			],
			layout: "narrow-right",
		}),
		// the caster specs a purple player: sides swap
		objective(120, {
			score: [90, 75],
			teamColor: [PURPLE_INK, GREEN_INK],
		}),
		playerStatus(120, {
			dead: [
				[true, false, false, false],
				[false, false, false, false],
			],
			layout: "narrow-right",
		}),
		minimap(180),
	]);
	// the two minimap reads contribute their own (all-clear) samples
	const samples = built[0]!.match.playerStatus!.samples;
	assert.deepEqual(
		samples.map((sample) => sample.t),
		[0, 60, 120, 180],
	);
	assert.deepEqual(samples[1]!.dead, [
		[true, false, false, false],
		[false, false, false, false],
	]);
	// the same on-screen left side is now the other team
	assert.deepEqual(samples[2]!.dead, [
		[false, false, false, false],
		[true, false, false, false],
	]);
	assert.equal(built[0]!.match.cast, true);
});

test("sub-2s dead-flag blips between dense opposite reads get flipped", () => {
	const deadAt = (slots: number[]) =>
		[
			[false, false, false, false],
			[0, 1, 2, 3].map((slot) => slots.includes(slot)),
		] as PlayerStatusData["dead"];
	const built = buildScannerMatches([
		mapStart(0),
		// slot0: a real death 101-107 with a one-read false "respawn" at 104
		// (background ink bleeding through the crossed-out icon), plus a
		// one-read false death at 111 after the real respawn
		playerStatus(100, { dead: deadAt([]) }),
		playerStatus(101, { dead: deadAt([0]) }),
		playerStatus(102, { dead: deadAt([0]) }),
		playerStatus(103, { dead: deadAt([0]) }),
		playerStatus(104, { dead: deadAt([]) }),
		playerStatus(105, { dead: deadAt([0]) }),
		playerStatus(106, { dead: deadAt([0]) }),
		playerStatus(107, { dead: deadAt([0]) }),
		playerStatus(108, { dead: deadAt([]) }),
		playerStatus(109, { dead: deadAt([]) }),
		playerStatus(110, { dead: deadAt([]) }),
		playerStatus(111, { dead: deadAt([0]) }),
		playerStatus(112, { dead: deadAt([]) }),
		playerStatus(113, { dead: deadAt([]) }),
		scoreboard(300),
	]);
	const slot0Deads = built[0]!.match.playerStatus!.samples.map(
		(sample) => sample.dead[1][0],
	);
	assert.deepEqual(slot0Deads, [
		false,
		...Array.from({ length: 7 }, () => true),
		...Array.from({ length: 6 }, () => false),
	]);
});

test("a lone dead read between sparse reads is kept", () => {
	const dead = [
		[false, false, false, false],
		[true, false, false, false],
	] as PlayerStatusData["dead"];
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(60),
		playerStatus(120, { dead }),
		playerStatus(180),
		scoreboard(300),
	]);
	assert.deepEqual(built[0]!.match.playerStatus!.samples[1]!.dead, dead);
});

test("a sub-10s not-ready gap between ready reads with no death bridges to ready", () => {
	const specialAt = (on: boolean) =>
		[
			[on, false, false, false],
			[false, false, false, false],
		] as PlayerStatusData["special"];
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(100, { special: specialAt(true) }),
		playerStatus(102, { special: specialAt(false) }),
		playerStatus(104, { special: specialAt(false) }),
		playerStatus(106, { special: specialAt(true) }),
		playerStatus(108, { special: specialAt(false) }),
		scoreboard(300),
	]);
	const slot0Specials = built[0]!.match.playerStatus!.samples.map(
		(sample) => sample.special[0][0],
	);
	// the interior gap bridges; the trailing not-ready run is an edge and stays
	assert.deepEqual(slot0Specials, [true, true, true, true, false]);
});

test("a not-ready gap explained by a death inside it is kept", () => {
	const read = (special: boolean, dead: boolean) => ({
		special: [
			[special, false, false, false],
			[false, false, false, false],
		] as PlayerStatusData["special"],
		dead: [
			[dead, false, false, false],
			[false, false, false, false],
		] as PlayerStatusData["dead"],
	});
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(100, read(true, false)),
		playerStatus(102, read(false, true)),
		playerStatus(106, read(false, false)),
		playerStatus(108, read(true, false)),
		scoreboard(300),
	]);
	const slot0Specials = built[0]!.match.playerStatus!.samples.map(
		(sample) => sample.special[0][0],
	);
	assert.deepEqual(slot0Specials, [true, false, false, true]);
});

test("a not-ready gap wide enough to regain a special is kept", () => {
	const specialAt = (on: boolean) =>
		[
			[on, false, false, false],
			[false, false, false, false],
		] as PlayerStatusData["special"];
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(100, { special: specialAt(true) }),
		playerStatus(102, { special: specialAt(false) }),
		playerStatus(112, { special: specialAt(false) }),
		playerStatus(114, { special: specialAt(true) }),
		scoreboard(300),
	]);
	const slot0Specials = built[0]!.match.playerStatus!.samples.map(
		(sample) => sample.special[0][0],
	);
	assert.deepEqual(slot0Specials, [true, false, false, true]);
});

test("a known non-SZ match drops its player-status reads too", () => {
	const events = [
		mapStart(0, { mode: "CB" }),
		objective(60),
		playerStatus(61),
		scoreboard(300, { mode: "CB" }),
	];
	const built = buildScannerMatches(events);
	assert.equal(built[0]!.match.playerStatus, null);
	assert.deepEqual(invalidObjectiveEvents(built), [events[1], events[2]]);
});

test("replay wipes drop status reads by the shared clock projection", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(60, { score: [80, 6] }),
		playerStatus(60),
		objective(61, { score: [78, 6] }),
		// broadcast re-runs the opening moments, clock jumped back
		playerStatus(90, { time: 291 }),
		objective(91, { time: 290, score: [99, 100] }),
		scoreboard(300),
	]);
	assert.deepEqual(
		built[0]!.match.playerStatus!.samples.map((sample) => sample.t),
		[60],
	);
});

test("minimap card states become timerless player-status samples", () => {
	const built = buildScannerMatches([
		minimap(70, { dead: [[2], [0]], specialReady: [[], [3]] }),
		minimap(120),
	]);
	assert.deepEqual(built[0]!.match.playerStatus, {
		samples: [
			{
				t: 70,
				time: null,
				special: [
					[false, false, false, false],
					[false, false, false, true],
				],
				dead: [
					[false, false, true, false],
					[true, false, false, false],
				],
			},
			{
				t: 120,
				time: null,
				special: ALL_FALSE,
				dead: ALL_FALSE,
			},
		],
	});
});

test("a known non-SZ match still gets its minimap-sourced status samples", () => {
	const events = [
		mapStart(0, { mode: "CB" }),
		objective(60),
		playerStatus(61),
		minimap(90, { spectator: false, dead: [[0], []] }),
		scoreboard(300, { mode: "CB" }),
	];
	const built = buildScannerMatches(events);
	assert.equal(built[0]!.match.objective, null);
	const samples = built[0]!.match.playerStatus!.samples;
	assert.deepEqual(
		samples.map((sample) => sample.t),
		[90],
	);
	assert.deepEqual(samples[0]!.dead, [
		[true, false, false, false],
		[false, false, false, false],
	]);
	assert.deepEqual(invalidObjectiveEvents(built), [events[1], events[2]]);
});

test("a losing-side pov swaps minimap-sourced samples into teams order", () => {
	const built = buildScannerMatches([
		minimap(90, { spectator: false, dead: [[0], []] }),
		scoreboard(300, { povIndex: 6 }),
	]);
	const sample = built[0]!.match.playerStatus!.samples[0]!;
	assert.deepEqual(sample.dead, [
		[false, false, false, false],
		[true, false, false, false],
	]);
});

test("strip weapon evidence reorders status slots into scoreboard rows", () => {
	// strip seating [2010, 40, 3030, 1001] vs scoreboard rows ALPHA
	// [40, 1001, 2010, 3030]: slot0 belongs to row2
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(120, {
			dead: [
				[true, false, false, false],
				[false, false, false, false],
			],
		}),
		stripWeaponsEvent(121, [
			[2010, 40, 3030, 1001],
			[null, null, null, null],
		]),
		scoreboard(300),
	]);
	const sample = built[0]!.match.playerStatus!.samples[0]!;
	assert.deepEqual(sample.dead, [
		[false, false, true, false],
		[false, false, false, false],
	]);
});

test("weapon evidence below the assignment floor keeps the as-drawn order", () => {
	const dead = [
		[true, false, false, false],
		[false, false, false, false],
	] as PlayerStatusData["dead"];
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(120, { dead }),
		stripWeaponsEvent(
			121,
			[
				[2010, null, null, null],
				[null, null, null, null],
			],
			{
				score: 0.5,
			},
		),
		scoreboard(300),
	]);
	assert.deepEqual(built[0]!.match.playerStatus!.samples[0]!.dead, dead);
});

test("minimap enemy-card weapons vote the strip assignment too", () => {
	// enemy cards in strip seating [4010, 50, 8000, 210] vs rows BRAVO
	// [50, 210, 4010, 8000]: the strip-sourced side1 slot0 belongs to row2
	const seating: (MainWeaponId | null)[] = [4010, 50, 8000, 210];
	const built = buildScannerMatches([
		mapStart(0),
		minimap(60, { bravo: seating }),
		minimap(90, { bravo: seating }),
		playerStatus(120, {
			dead: [
				[false, false, false, false],
				[true, false, false, false],
			],
		}),
		scoreboard(300),
	]);
	const strip = built[0]!.match.playerStatus!.samples.at(-1)!;
	assert.deepEqual(strip.dead, [
		[false, false, false, false],
		[false, false, true, false],
	]);
});

test("pov diamond cards map to scoreboard rows by name", () => {
	const cards = [
		{ ...teammate(ALPHA[1]!, 0), name: "w2", dead: true },
		{ ...teammate(ALPHA[0]!, 1), name: "w1" },
		{ ...teammate(ALPHA[3]!, 2), name: "w4" },
		{ ...teammate(ALPHA[2]!, 3), name: "w3" },
	];
	const data: MinimapData = {
		stage: 0 as StageId,
		spectator: false,
		teammates: cards,
		enemies: BRAVO.map((id) => enemy(id)),
		teamColors: [null, null],
	};
	const built = buildScannerMatches([
		mapStart(0),
		{ type: "Minimap", t: 90, confidence: 0.8, data } as DetectedEvent,
		scoreboard(300),
	]);
	const sample = built[0]!.match.playerStatus!.samples[0]!;
	assert.deepEqual(sample.dead, [
		[false, true, false, false],
		[false, false, false, false],
	]);
});
