import assert from "node:assert/strict";
import { test } from "vitest";
import type {
	AbilityWithUnknown,
	MainWeaponId,
	ModeShort,
	StageId,
} from "~/modules/in-game-lists/types";
import type { DeathData } from "../../core/detectors/death/index";
import type { KillData } from "../../core/detectors/kill/index";
import type {
	MinimapData,
	MinimapEnemy,
	MinimapTeammate,
} from "../../core/detectors/minimap/index";
import type {
	ObjectiveData,
	TrackObjectiveData,
} from "../../core/detectors/objective/index";
import type { PlayerStatusData } from "../../core/detectors/objective/player-status";
import type { StripWeaponsData } from "../../core/detectors/objective/strip-weapons";
import type { ScoreboardData } from "../../core/detectors/scoreboard/index";
import type { ScoreboardBattleLogData } from "../../core/detectors/scoreboard-battle-log/index";
import type { ScoreboardBattleLogReplayData } from "../../core/detectors/scoreboard-battle-log-replay/index";
import type { ScoreboardOwnData } from "../../core/detectors/scoreboard-own/index";
import type { DetectedEvent } from "../../core/detectors/types";
import type { XRankPositionData } from "../../core/detectors/x-rank/position";
import type { XSetCountData } from "../../core/detectors/x-rank/set-count";
import type { XSetResultData } from "../../core/detectors/x-rank/set-result";
import {
	buildScannerMatches,
	ingestSkipReasons,
	invalidObjectiveEvents,
	isHistoryOnly,
	type MatchBuildCache,
} from "../../core/match-builder";
import { xBattleCards } from "../../core/x-battle";
import type { ScannerLobby } from "../../scanner-types";

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
		control = 0 as ObjectiveData["control"],
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

function trackObjective(
	t: number,
	{
		mode = "TC" as TrackObjectiveData["mode"],
		time = (300 - Math.round(t)) as number | null,
		score = [80, 100] as [number | null, number | null],
		control = 0 as TrackObjectiveData["control"],
		position = 30 as number | null,
		teamColor = [null, null] as ObjectiveData["teamColor"],
	} = {},
): DetectedEvent {
	const data: TrackObjectiveData = {
		mode,
		time,
		score,
		control,
		position,
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
		weapons: weaponIds = ALL as (MainWeaponId | null)[],
		povIndex = 0 as number | null,
		matchScores = [100, 47] as [number | null, number | null],
		paints = [] as (number | null)[],
		names = NAMES,
	} = {},
): DetectedEvent {
	const data: ScoreboardData = {
		lobby,
		mode,
		stage,
		matchScores,
		players: weaponIds.map((weaponId, i) => ({
			name: names[i] ?? `p${i}`,
			weaponId,
			paint: paints.length > 0 ? (paints[i] ?? null) : 1000 + t,
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
		stage = 0 as StageId | null,
		mode = "SZ" as ModeShort | null,
		paints = [] as (number | null)[],
	} = {},
): DetectedEvent & { detectedAt?: number } {
	const base = scoreboard(t, { stage, mode, paints }).data as ScoreboardData;
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
	{
		timestamp = null as string | null,
		paints = [] as (number | null)[],
		stage = 0 as StageId | null,
		mode = "SZ" as ModeShort | null,
	} = {},
): DetectedEvent & { detectedAt?: number } {
	const base = scoreboard(t, { paints, stage, mode }).data as ScoreboardData;
	const data: ScoreboardBattleLogData = {
		...base,
		timestamp,
		matchScores: [100, 0],
	};
	return { type: "ScoreboardBattleLog", t, confidence: 0.9, data };
}

function teammate(weaponId: MainWeaponId | null): MinimapTeammate {
	return {
		self: false,
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
		confidence = 0.8,
	} = {},
): DetectedEvent {
	const data: MinimapData = {
		stage,
		spectator,
		teammates: alpha.map((id, i) => ({
			...teammate(id),
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
	return { type: "Minimap", t, confidence, data };
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
				control: 0,
			},
			{
				t: 180,
				time: 155,
				score: [80, 53],
				penalty: [null, null],
				control: 0,
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
		control: 1,
	});
});

test("track reads become samples with the objective's position", () => {
	const built = buildScannerMatches([
		mapStart(0, { mode: "RM" }),
		trackObjective(120, { control: null, position: 0, score: [null, null] }),
		trackObjective(130, { control: 1, position: -40, score: [null, 60] }),
		scoreboard(300, { mode: "RM" }),
	]);
	assert.deepEqual(built[0]!.match.objective, {
		mode: "RM",
		samples: [
			{
				t: 120,
				time: 180,
				score: [null, null],
				penalty: [null, null],
				control: null,
				position: 0,
			},
			{
				t: 130,
				time: 170,
				score: [null, 60],
				penalty: [null, null],
				control: 1,
				position: -40,
			},
		],
	});
});

test("a losing-side pov flips the track position with the sides", () => {
	const built = buildScannerMatches([
		mapStart(0, { mode: "TC" }),
		trackObjective(120, { control: 0, position: 30, score: [80, 100] }),
		scoreboard(300, { mode: "TC", povIndex: 6 }),
	]);
	assert.deepEqual(built[0]!.match.objective!.samples[0], {
		t: 120,
		time: 180,
		score: [100, 80],
		penalty: [null, null],
		control: 1,
		position: -30,
	});
});

test("casted track swaps flip the position with the sides", () => {
	const built = buildScannerMatches([
		minimap(0, { teamColors: [GREEN_INK, PURPLE_INK] }),
		trackObjective(60, {
			control: 0,
			position: 20,
			teamColor: [GREEN_INK, PURPLE_INK],
		}),
		// the caster specs a purple player: purple's side moves left
		trackObjective(61, {
			control: 1,
			position: -25,
			teamColor: [PURPLE_INK, GREEN_INK],
		}),
		minimap(90, { teamColors: [GREEN_INK, PURPLE_INK] }),
	]);
	assert.deepEqual(
		built[0]!.match.objective!.samples.map((sample) => [
			sample.control,
			sample.position,
		]),
		[
			[0, 20],
			[0, 25],
		],
	);
});

test("an unknown-mode track match takes its mode from the checkpoint markers", () => {
	const built = buildScannerMatches([
		mapStart(0, { mode: null }),
		trackObjective(60, { mode: "RM" }),
		trackObjective(61, { mode: null, position: 31 }),
		trackObjective(62, { mode: "RM", position: 32 }),
		scoreboard(300, { mode: null }),
	]);
	assert.equal(built[0]!.match.objective!.mode, "RM");
});

test("a known TC/RM match drops SZ lookalike reads, and an SZ match track ones", () => {
	const track = [
		mapStart(0, { mode: "TC" }),
		objective(60),
		trackObjective(61),
		scoreboard(300, { mode: "TC" }),
	];
	const trackBuilt = buildScannerMatches(track);
	assert.equal(trackBuilt[0]!.match.objective!.samples[0]!.t, 61);
	assert.deepEqual(invalidObjectiveEvents(trackBuilt), [track[1]]);

	const zones = [
		mapStart(0),
		objective(60),
		trackObjective(61),
		scoreboard(300),
	];
	const zonesBuilt = buildScannerMatches(zones);
	assert.equal(zonesBuilt[0]!.match.objective!.samples[0]!.t, 60);
	assert.deepEqual(invalidObjectiveEvents(zonesBuilt), [zones[2]]);
});

test("an unknown-mode match builds from its majority overlay and deletes nothing", () => {
	const events = [
		mapStart(0, { mode: null }),
		objective(60),
		trackObjective(61),
		trackObjective(62, { position: 35 }),
		scoreboard(300, { mode: null }),
	];
	const built = buildScannerMatches(events);
	assert.deepEqual(
		built[0]!.match.objective!.samples.map((sample) => sample.t),
		[61, 62],
	);
	assert.deepEqual(invalidObjectiveEvents(built), []);
});

test("an intro and results screen disagreeing on the mode leave it unknown and delete nothing", () => {
	const events = [
		mapStart(0),
		objective(60),
		playerStatus(61),
		scoreboard(300, { mode: "CB" }),
	];
	const built = buildScannerMatches(events);
	assert.equal(built[0]!.match.mode, null);
	assert.equal(built[0]!.match.objective!.samples.length, 1);
	assert.equal(built[0]!.match.playerStatus!.samples.length, 1);
	assert.deepEqual(invalidObjectiveEvents(built), []);
});

test("a Turf War match drops its objective reads", () => {
	const events = [
		mapStart(0, { mode: "TW" }),
		objective(60),
		objective(120),
		scoreboard(300, { mode: "TW" }),
	];
	const built = buildScannerMatches(events);
	assert.equal(built[0]!.match.objective, null);
	assert.deepEqual(invalidObjectiveEvents(built), [events[1], events[2]]);
});

test("a Clam Blitz match keeps its plates reads", () => {
	const events = [
		mapStart(0, { mode: "CB" }),
		objective(60, { score: [100, 80], penalty: [null, 10], control: null }),
		playerStatus(61),
		scoreboard(300, { mode: "CB" }),
	];
	const built = buildScannerMatches(events);
	assert.deepEqual(built[0]!.match.objective, {
		mode: "CB",
		samples: [
			{
				t: 60,
				time: 240,
				score: [100, 80],
				penalty: [null, 10],
				control: null,
			},
		],
	});
	assert.equal(built[0]!.match.playerStatus!.samples.length, 1);
	assert.deepEqual(invalidObjectiveEvents(built), []);
});

test("an unknown-mode match keeps its objective reads", () => {
	const built = buildScannerMatches([
		mapStart(0, { mode: null }),
		objective(60),
		scoreboard(300, { mode: null }),
	]);
	assert.equal(built[0]!.match.objective!.samples.length, 1);
	assert.equal(built[0]!.match.objective!.mode, null);
	assert.deepEqual(invalidObjectiveEvents(built), []);
});

const GREEN_INK = { r: 146, g: 180, b: 96 };
const PURPLE_INK = { r: 130, g: 43, b: 130 };

test("casted plate swaps are reoriented by team ink color", () => {
	const built = buildScannerMatches([
		minimap(0, { teamColors: [GREEN_INK, PURPLE_INK] }),
		objective(60, {
			score: [80, 90],
			control: 0,
			teamColor: [GREEN_INK, PURPLE_INK],
		}),
		// the caster specs a purple player: purple's plate moves left
		objective(120, {
			score: [90, 75],
			penalty: [4, null],
			control: 0,
			teamColor: [PURPLE_INK, GREEN_INK],
		}),
		// colors unreadable: the previous arrangement carries over
		objective(125, {
			score: [85, 75],
			control: 0,
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
		[0, 1, 1],
	);
});

test("minimap ink colors anchor a bravo-first cluster into teams order", () => {
	const built = buildScannerMatches([
		minimap(0, { teamColors: [GREEN_INK, PURPLE_INK] }),
		// every read had purple (bravo) on the left plate
		objective(60, {
			score: [90, 80],
			control: 1,
			teamColor: [PURPLE_INK, GREEN_INK],
		}),
		minimap(120),
	]);
	const samples = built[0]!.match.objective!.samples;
	assert.deepEqual(samples[0]!.score, [80, 90]);
	assert.equal(samples[0]!.control, 0);
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

const OWN_BUILD: AbilityWithUnknown[][] = [
	["SCU", "ISM", "ISM", "ISS"],
	["QR", "RSU", "RSU", "QSJ"],
	["SJ", "SSU", "SSU", "IRU"],
];

function ownResults(t: number): DetectedEvent {
	const data: ScoreboardOwnData = {
		lobby: "PRIVATE",
		mode: "SZ",
		stage: 0,
		weaponId: 40,
		abilities: OWN_BUILD,
	};
	return { type: "ScoreboardOwn", t, confidence: 0.9, data };
}

test("the personal results screen completes the POV player's build", () => {
	const [built] = buildScannerMatches([
		mapStart(0),
		scoreboard(300, { povIndex: 5 }),
		ownResults(320),
	]);
	assert.deepEqual(built!.match.teams[1].players[1]!.abilities, OWN_BUILD);
	assert.equal(built!.sources.length, 3);
});

test("a personal results screen long after the scoreboard is left alone", () => {
	const [built] = buildScannerMatches([
		mapStart(0),
		scoreboard(300),
		ownResults(600),
	]);
	assert.equal(built!.match.teams[0].players[0]!.abilities, undefined);
	assert.equal(built!.sources.length, 2);
});

const SET_COUNT: XSetCountData = { mode: "TC", wins: 1, losses: 2 };
const SET_RESULT: XSetResultData = {
	mode: "TC",
	results: ["LOSE", "LOSE", "WIN", "WIN", "LOSE"],
	powerChange: -29.2,
	power: 2723.2,
};
const RANK_POSITION: XRankPositionData = {
	mode: "TC",
	position: 259,
	direction: "DOWN",
};

function xCard(
	t: number,
	type: "XSetCount" | "XSetResult" | "XRankPosition",
): DetectedEvent {
	const data = {
		XSetCount: SET_COUNT,
		XSetResult: SET_RESULT,
		XRankPosition: RANK_POSITION,
	}[type];
	return { type, t, confidence: 0.95, data };
}

test("an X Battle set count shown before the results screen joins that game", () => {
	const [built] = buildScannerMatches([
		mapStart(0),
		ownResults(300),
		xCard(305, "XSetCount"),
		scoreboard(320, { lobby: "X" }),
	]);
	assert.deepEqual(xBattleCards(built!.sources), {
		count: SET_COUNT,
		result: null,
		position: null,
	});
});

test("the X Battle set result and position join the deciding game, not the next one", () => {
	const built = buildScannerMatches([
		mapStart(0),
		xCard(300, "XSetResult"),
		xCard(303, "XRankPosition"),
		scoreboard(320, { lobby: "X" }),
		mapStart(450, { stage: 1 }),
		scoreboard(750, { lobby: "X", stage: 1 }),
	]);
	assert.deepEqual(
		built.map((b) => xBattleCards(b.sources)),
		[
			{ count: null, result: SET_RESULT, position: RANK_POSITION },
			{ count: null, result: null, position: null },
		],
	);
});

test("an X Battle card after the game's results screen joins that game", () => {
	const [built] = buildScannerMatches([
		mapStart(0),
		scoreboard(300, { lobby: "X" }),
		xCard(330, "XSetCount"),
	]);
	assert.deepEqual(xBattleCards(built!.sources).count, SET_COUNT);
});

test("an X Battle card with no game open is claimed by the results screen after it", () => {
	const [built] = buildScannerMatches([
		xCard(300, "XSetCount"),
		scoreboard(320, { lobby: "X" }),
	]);
	assert.deepEqual(xBattleCards(built!.sources).count, SET_COUNT);
});

test.each([
	{
		why: "no results screen",
		events: () => [mapStart(0), minimap(120), xCard(330, "XSetCount")],
	},
	{
		why: "an unread results header, card before it",
		events: () => [
			mapStart(0),
			xCard(300, "XSetCount"),
			scoreboard(320, { lobby: null }),
		],
	},
	{
		why: "an unread results header, card after it",
		events: () => [
			mapStart(0),
			scoreboard(300, { lobby: null }),
			xCard(330, "XSetCount"),
		],
	},
])(
	"a game carrying an X Battle card is an X Battle game: $why",
	({ events }) => {
		const [built] = buildScannerMatches(events());
		assert.equal(built!.match.lobby, "X");
	},
);

test("an X Battle card joins no game of another lobby, nor one closed long before", () => {
	const built = buildScannerMatches([
		mapStart(0),
		scoreboard(300, { lobby: "PRIVATE" }),
		xCard(330, "XSetCount"),
		mapStart(450, { stage: 1 }),
		scoreboard(750, { lobby: "X", stage: 1 }),
		xCard(900, "XSetCount"),
	]);
	assert.deepEqual(
		built.map((b) => b.sources.length),
		[2, 2],
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

test("lobbies other than private and X battle are recorded and skipped on ingest", () => {
	const built = buildScannerMatches([
		mapStart(0),
		scoreboard(300, { lobby: "REGULAR" }),
		mapStart(400),
		scoreboard(700, { lobby: "SERIES" }),
		mapStart(800),
		scoreboard(1100, { lobby: "X" }),
		mapStart(1200),
		scoreboard(1500),
	]);
	const skipped = ingestSkipReasons(built);
	assert.equal(built.length, 4);
	assert.equal(built[0]!.match.lobby, "REGULAR");
	assert.equal(skipped.get(built[0]!), "lobby");
	assert.equal(skipped.get(built[1]!), "lobby");
	assert.equal(skipped.get(built[2]!), undefined);
	assert.equal(skipped.get(built[3]!), undefined);
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
		scoreboard(150, { matchScores: [null, null] }),
		mapStart(250),
		scoreboard(550),
	]);
	const skipped = ingestSkipReasons(built);
	assert.equal(built.length, 2);
	assert.equal(skipped.get(built[0]!), "disconnect");
	assert.equal(skipped.get(built[1]!), undefined);
});

test("a full-length match whose score went unread is kept when the same map follows", () => {
	const built = buildScannerMatches([
		mapStart(0),
		scoreboard(320, { matchScores: [null, null] }),
		mapStart(400),
		scoreboard(720),
	]);
	assert.equal(built.length, 2);
	assert.equal(ingestSkipReasons(built).size, 0);
});

test("a scoreless match whose counters ran down the clock is kept when the same map follows", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(140, { time: 5, score: [40, 60], penalty: [0, 0] }),
		scoreboard(160, { matchScores: [null, null] }),
		mapStart(250),
		scoreboard(550),
	]);
	assert.equal(built.length, 2);
	assert.equal(ingestSkipReasons(built).size, 0);
});

test("a match whose results screen went unread is kept when the same map follows", () => {
	const built = buildScannerMatches([
		mapStart(0),
		minimap(60),
		mapStart(150),
		scoreboard(450),
	]);
	assert.equal(built.length, 2);
	assert.equal(ingestSkipReasons(built).size, 0);
});

test("a battle log view of another game on the same map is no replay", () => {
	const built = buildScannerMatches([
		mapStart(0),
		scoreboard(150, { matchScores: [null, null], paints: GAME_PAINTS }),
		battleLogScoreboard(200, { paints: OTHER_GAME_PAINTS }),
	]);
	assert.equal(built.length, 2);
	assert.equal(ingestSkipReasons(built).size, 0);
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

const GAME_PAINTS = [1204, 987, 1530, 842, 1102, 765, 1311, 690];
const OTHER_GAME_PAINTS = [1188, 1003, 1421, 901, 1250, 612, 1377, 745];
const PLAYED_AT = new Date(2025, 11, 25, 21, 34).getTime();

function playedGame(): DetectedEvent[] {
	const results = scoreboard(300, { paints: GAME_PAINTS }) as DetectedEvent & {
		detectedAt?: number;
	};
	results.detectedAt = PLAYED_AT;
	return [mapStart(0), death(100, "l1"), results];
}

test("a battle log view of an already built game joins its match", () => {
	const view = battleLogScoreboard(900, {
		timestamp: "25.12.2025 21:30",
		paints: GAME_PAINTS,
	});
	const built = buildScannerMatches([...playedGame(), view]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.sources.at(-1), view);
	assert.equal(built[0]!.match.playedAt, PLAYED_AT);
});

test("a battle log view with the winner panel misplaced still joins its match", () => {
	const swapped = [...GAME_PAINTS.slice(4), ...GAME_PAINTS.slice(0, 4)];
	const built = buildScannerMatches([
		...playedGame(),
		battleLogScoreboard(900, { paints: swapped }),
	]);
	assert.equal(built.length, 1);
});

test.each([
	{
		why: "a paint total misread",
		paints: GAME_PAINTS.map((paint, i) => (i === 2 ? paint + 5 : paint)),
	},
	{
		why: "a paint total unread",
		paints: GAME_PAINTS.map((paint, i) => (i === 6 ? null : paint)),
	},
	{
		why: "two paint totals misread",
		paints: GAME_PAINTS.map((paint, i) => (i < 2 ? paint + 1 : paint)),
	},
])("a battle log view with $why still joins its match", ({ paints }) => {
	const built = buildScannerMatches([
		...playedGame(),
		battleLogScoreboard(900, { paints }),
	]);
	assert.equal(built.length, 1);
});

test("a battle log view sharing too few paint totals forms its own match", () => {
	const paints = GAME_PAINTS.map((paint, i) => (i < 3 ? paint + 1 : paint));
	const built = buildScannerMatches([
		...playedGame(),
		battleLogScoreboard(900, { paints }),
	]);
	assert.equal(built.length, 2);
});

test("a battle log view of the same paint totals on another stage forms its own match", () => {
	const built = buildScannerMatches([
		...playedGame(),
		battleLogScoreboard(900, { paints: GAME_PAINTS, stage: 1 as StageId }),
	]);
	assert.equal(built.length, 2);
});

test("a match only battle history screens back is history only", () => {
	const [played, browsed, replay] = buildScannerMatches([
		...playedGame(),
		battleLogScoreboard(900, { paints: GAME_PAINTS }),
		battleLogScoreboard(950, { paints: OTHER_GAME_PAINTS }),
		replayScoreboard(1000),
	]);
	assert.equal(isHistoryOnly(played!), false);
	assert.equal(isHistoryOnly(browsed!), true);
	assert.equal(isHistoryOnly(replay!), true);
});

test("with a cache, a rebuild reuses each match whose events are unchanged", () => {
	const cache: MatchBuildCache<DetectedEvent> = new WeakMap();
	const first = [mapStart(0), death(100, "l1"), scoreboard(300)];
	const second = [mapStart(400), death(450, "l2")];
	const before = buildScannerMatches(
		[...first, ...second, minimap(460)],
		cache,
	);
	const after = buildScannerMatches(
		[...first, ...second, minimap(460), scoreboard(700)],
		cache,
	);
	assert.equal(after[0], before[0]);
	assert.notEqual(after[1], before[1]);
	assert.deepEqual(
		after,
		buildScannerMatches([...first, ...second, minimap(460), scoreboard(700)]),
	);
});

test("with a cache, a battle log view joining a match leaves the cached match as it was", () => {
	const cache: MatchBuildCache<DetectedEvent> = new WeakMap();
	const game = playedGame();
	const [before] = buildScannerMatches(game, cache);
	const view = battleLogScoreboard(900, { paints: GAME_PAINTS });
	const [after] = buildScannerMatches([...game, view], cache);
	assert.equal(before!.sources.length, 3);
	assert.equal(after!.sources.at(-1), view);
	assert.equal(
		buildScannerMatches([...game, view], cache)[0]!.sources.length,
		4,
	);
});

test("with a cache, a personal results screen leaves the cached match as it was", () => {
	const cache: MatchBuildCache<DetectedEvent> = new WeakMap();
	const game = [mapStart(0), scoreboard(300, { povIndex: 5 })];
	const [before] = buildScannerMatches(game, cache);
	const [after] = buildScannerMatches([...game, ownResults(320)], cache);
	assert.equal(before!.match.teams[1].players[1]!.abilities, undefined);
	assert.deepEqual(after!.match.teams[1].players[1]!.abilities, OWN_BUILD);
	assert.equal(after!.match.teams[0], before!.match.teams[0]);
});

test("a battle log view of another game forms its own match", () => {
	const built = buildScannerMatches([
		...playedGame(),
		battleLogScoreboard(900, { paints: OTHER_GAME_PAINTS }),
	]);
	assert.equal(built.length, 2);
});

test("a battle log view with its stage unread forms no match of its own", () => {
	const view = battleLogScoreboard(900, {
		paints: OTHER_GAME_PAINTS,
		stage: null,
	});
	const built = buildScannerMatches([...playedGame(), view]);
	assert.equal(built.length, 1);
	assert.ok(!built[0]!.sources.includes(view));
});

test("a battle log view with its stage unread still joins its already built match", () => {
	const view = battleLogScoreboard(900, { paints: GAME_PAINTS, stage: null });
	const built = buildScannerMatches([...playedGame(), view]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.sources.at(-1), view);
});

test("a battle log view with its stage unread does not close the match still gathering events", () => {
	const built = buildScannerMatches([
		mapStart(0),
		death(100, "l1"),
		battleLogScoreboard(150, { paints: OTHER_GAME_PAINTS, stage: null }),
		scoreboard(300, { paints: GAME_PAINTS }),
	]);
	assert.equal(built.length, 1);
	assert.deepEqual(
		built[0]!.sources.map((e) => e.t),
		[0, 100, 300],
	);
});

test("a battle log view whose recording time contradicts the earlier read forms its own match", () => {
	const built = buildScannerMatches([
		...playedGame(),
		battleLogScoreboard(900, {
			timestamp: "25.12.2025 19:30",
			paints: GAME_PAINTS,
		}),
	]);
	assert.equal(built.length, 2);
});

test("a battle log view with too few paint totals read forms its own match", () => {
	const sparse = GAME_PAINTS.map((paint, i) => (i < 5 ? paint : null));
	const results = scoreboard(300, { paints: sparse });
	const built = buildScannerMatches([
		mapStart(0),
		results,
		battleLogScoreboard(900, { paints: sparse }),
	]);
	assert.equal(built.length, 2);
});

test("a battle log view does not close the match still gathering events", () => {
	const built = buildScannerMatches([
		...playedGame(),
		mapStart(1000),
		death(1100, "l2"),
		battleLogScoreboard(1150, { paints: GAME_PAINTS }),
		scoreboard(1300, { paints: OTHER_GAME_PAINTS }),
	]);
	assert.equal(built.length, 2);
	assert.deepEqual(
		built[1]!.sources.map((e) => e.t),
		[1000, 1100, 1300],
	);
});

test.each([
	{ why: "an open match", intro: [mapStart(0)] },
	{ why: "orphan reads", intro: [] },
])(
	"a battle log view stands in for a missed results screen of $why",
	({ intro }) => {
		const view = battleLogScoreboard(400, {
			timestamp: "25.12.2025 21:30",
			paints: OTHER_GAME_PAINTS,
		});
		const reads = [...intro, death(100, "l1")];
		for (const read of reads) {
			(read as DetectedEvent & { detectedAt?: number }).detectedAt = PLAYED_AT;
		}
		const built = buildScannerMatches([...reads, view]);
		assert.equal(built.length, 1);
		assert.deepEqual(built[0]!.sources, [...reads, view]);
	},
);

test.each([
	{
		why: "on another stage",
		view: () => battleLogScoreboard(200, { stage: 5 as StageId }),
	},
	{
		why: "of another mode",
		view: () => {
			const view = battleLogScoreboard(200);
			(view.data as ScoreboardData).mode = "CB";
			return view;
		},
	},
	{
		why: "recorded long before the game",
		view: () => battleLogScoreboard(200, { timestamp: "25.12.2025 19:30" }),
	},
])(
	"a battle log view $why leaves the match being gathered open",
	({ view: makeView }) => {
		const start = mapStart(0) as DetectedEvent & { detectedAt?: number };
		start.detectedAt = PLAYED_AT;
		const view = makeView();
		const built = buildScannerMatches([
			start,
			objective(60),
			death(100, "l1"),
			view,
			scoreboard(300, { paints: GAME_PAINTS }),
		]);
		assert.deepEqual(
			built.map((b) => b.sources.map((e) => e.t)),
			[[0, 60, 100, 300], [200]],
		);
		assert.deepEqual(invalidObjectiveEvents(built), []);
	},
);

const MINUTE_MS = 60 * 1000;

function seenAt<T extends DetectedEvent>(event: T, detectedAt: number): T {
	return Object.assign(event, { detectedAt });
}

/** A game whose results screen was missed: minimaps back it, nothing closes it. */
function gameMissingResults(t: number, detectedAt?: number): DetectedEvent[] {
	const reads = [mapStart(t), minimap(t + 60), death(t + 100, "l1")];
	if (detectedAt === undefined) return reads;
	return reads.map((read) => seenAt(read, detectedAt));
}

function laterGameOnStage1(t: number, detectedAt?: number): DetectedEvent[] {
	const reads = [
		mapStart(t, { stage: 1 as StageId }),
		minimap(t + 60, { stage: 1 as StageId }),
	];
	if (detectedAt === undefined) return reads;
	return reads.map((read) => seenAt(read, detectedAt));
}

test.each([
	{ why: "later game complete", closesLater: true },
	{ why: "later game still open", closesLater: false },
])(
	"a battle log view completes an earlier match missing its results screen ($why)",
	({ closesLater }) => {
		const missed = gameMissingResults(0, PLAYED_AT);
		const later = laterGameOnStage1(400, PLAYED_AT + 7 * MINUTE_MS);
		const laterResults = scoreboard(700, {
			stage: 1 as StageId,
			paints: OTHER_GAME_PAINTS,
		});
		const view = battleLogScoreboard(900, {
			timestamp: "25.12.2025 21:30",
			paints: GAME_PAINTS,
		});

		const built = buildScannerMatches(
			closesLater
				? [...missed, ...later, laterResults, view]
				: [
						...missed,
						...later,
						view,
						scoreboard(1000, { stage: 1 as StageId }),
					],
		);

		assert.equal(built.length, 2);
		assert.deepEqual(built[0]!.sources, [...missed, view]);
		assert.deepEqual(built[0]!.match.matchScores, [100, 0]);
		assert.equal(built[0]!.match.winner, 0);
		assert.equal(built[0]!.match.playedAt, PLAYED_AT - 4 * MINUTE_MS);
		assert.deepEqual(
			built[1]!.sources.map((e) => e.t),
			[400, 460, closesLater ? 700 : 1000],
		);
	},
);

test("a battle log view recorded long before an earlier match missing its results screen forms its own match", () => {
	const built = buildScannerMatches([
		...gameMissingResults(0, PLAYED_AT),
		...laterGameOnStage1(400, PLAYED_AT + 7 * MINUTE_MS),
		scoreboard(700, { stage: 1 as StageId }),
		battleLogScoreboard(900, { timestamp: "25.12.2025 19:30" }),
	]);
	assert.deepEqual(
		built.map((b) => b.sources.map((e) => e.t)),
		[[0, 60, 100], [400, 460, 700], [900]],
	);
});

test("a battle log view completes the earlier match missing its results screen closest to its recording time", () => {
	const view = battleLogScoreboard(1300, { timestamp: "25.12.2025 21:40" });
	const built = buildScannerMatches([
		...gameMissingResults(0, PLAYED_AT),
		...gameMissingResults(400, PLAYED_AT + 7 * MINUTE_MS),
		...laterGameOnStage1(800, PLAYED_AT + 14 * MINUTE_MS),
		scoreboard(1100, { stage: 1 as StageId }),
		view,
	]);
	assert.equal(built.length, 3);
	assert.equal(built[1]!.sources.at(-1), view);
});

test("without a wall clock a battle log view completes the sole earlier match missing its results screen", () => {
	const view = battleLogScoreboard(900);
	const built = buildScannerMatches([
		...gameMissingResults(0),
		...laterGameOnStage1(400),
		scoreboard(700, { stage: 1 as StageId }),
		view,
	]);
	assert.equal(built.length, 2);
	assert.equal(built[0]!.sources.at(-1), view);
});

test("without a wall clock a battle log view fitting several earlier matches missing their results screens forms its own match", () => {
	const built = buildScannerMatches([
		...gameMissingResults(0),
		...gameMissingResults(400),
		...laterGameOnStage1(800),
		scoreboard(1100, { stage: 1 as StageId }),
		battleLogScoreboard(1300),
	]);
	assert.equal(built.length, 4);
	assert.deepEqual(
		built.at(-1)!.sources.map((e) => e.t),
		[1300],
	);
});

test("with a cache, an earlier match completed from the battle log keeps its identity across rebuilds", () => {
	const cache: MatchBuildCache<DetectedEvent> = new WeakMap();
	const played = [
		...gameMissingResults(0),
		...laterGameOnStage1(400),
		scoreboard(700, { stage: 1 as StageId }),
	];
	const view = battleLogScoreboard(900);
	const [missed] = buildScannerMatches(played, cache);
	const [completed] = buildScannerMatches([...played, view], cache);
	const [completedAgain] = buildScannerMatches([...played, view], cache);
	assert.notEqual(completed, missed);
	assert.equal(completedAgain, completed);
	assert.equal(buildScannerMatches(played, cache)[0], missed);
});

test("a battle log view recorded long before the orphan reads leaves them unclaimed", () => {
	const read = death(100, "l1") as DetectedEvent & { detectedAt?: number };
	read.detectedAt = PLAYED_AT;
	const view = battleLogScoreboard(200, { timestamp: "25.12.2025 19:30" });
	const built = buildScannerMatches([read, view, scoreboard(300)]);
	assert.deepEqual(
		built.map((b) => b.sources.map((e) => e.t)),
		[[100, 300], [200]],
	);
});

test("a results screen read again with no match opened since joins its match", () => {
	const reread = scoreboard(345, { paints: GAME_PAINTS });
	const built = buildScannerMatches([...playedGame(), reread]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.sources.at(-1), reread);
});

test("a results screen read again with a paint total misread joins its match", () => {
	const paints = GAME_PAINTS.map((paint, i) => (i === 0 ? paint + 10 : paint));
	const built = buildScannerMatches([
		...playedGame(),
		scoreboard(345, { paints }),
	]);
	assert.equal(built.length, 1);
});

test("a results screen repeating an earlier board is a new game", () => {
	const built = buildScannerMatches([
		...playedGame(),
		mapStart(1000),
		scoreboard(1300, { paints: GAME_PAINTS }),
	]);
	assert.equal(built.length, 2);
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

test("a cast match's players come from its most confident minimap read first", () => {
	const midWipe = [3010, ...ALPHA.slice(1)] as MainWeaponId[];
	const built = buildScannerMatches([
		minimap(70, { alpha: midWipe, confidence: 0.65 }),
		minimap(71, { confidence: 0.78 }),
	]);
	assert.deepEqual(weapons(built[0]!.match), ALL);
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

test("consistent minimap misreads do not split a match from its intro's stage", () => {
	const built = buildScannerMatches([
		mapStart(30, { stage: 0 }),
		minimap(70, { stage: 0 }),
		minimap(90, { stage: 1 }),
		minimap(110, { stage: 1 }),
		minimap(130, { stage: 1 }),
		minimap(150, { stage: 0 }),
	]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.match.stage, 0);
});

test("a stage change the intro's stage never returns from splits off the next game", () => {
	const built = buildScannerMatches([
		mapStart(30, { stage: 0 }),
		minimap(70, { stage: 0 }),
		minimap(90, { stage: 0 }),
		minimap(300, { stage: 1 }),
		minimap(320, { stage: 1 }),
	]);
	assert.deepEqual(
		built.map((b) => [b.match.stage, b.match.startsAt]),
		[
			[0, 30],
			[1, 300],
		],
	);
});

test("the intro's stage read again only in the next game does not hold the split back", () => {
	const built = buildScannerMatches([
		mapStart(30, { stage: 0 }),
		minimap(70, { stage: 0 }),
		minimap(300, { stage: 1 }),
		minimap(320, { stage: 1 }),
		scoreboard(400, { stage: 1 }),
		mapStart(450, { stage: 0 }),
		minimap(490, { stage: 0 }),
	]);
	assert.deepEqual(
		built.map((b) => b.match.startsAt),
		[30, 300, 450],
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

test("ready reads before a special could charge are dropped, not bridged into the first real one", () => {
	const specialAt = (on: boolean) =>
		[
			[on, false, false, false],
			[false, false, false, false],
		] as PlayerStatusData["special"];
	const built = buildScannerMatches([
		mapStart(0),
		playerStatus(11, { time: 300, special: specialAt(true) }),
		playerStatus(15, { time: 296, special: specialAt(true) }),
		playerStatus(16, { time: 295, special: specialAt(false) }),
		playerStatus(20, { time: 291, special: specialAt(true) }),
		playerStatus(26, { time: 285, special: specialAt(true) }),
		playerStatus(28, { time: 283, special: specialAt(false) }),
		scoreboard(300),
	]);
	const slot0Specials = built[0]!.match.playerStatus!.samples.map(
		(sample) => sample.special[0][0],
	);
	assert.deepEqual(slot0Specials, [false, false, false, true, true, false]);
});

test("a timerless minimap read before the clock starts carries no special", () => {
	const built = buildScannerMatches([
		minimap(10, { specialReady: [[], [0]] }),
		playerStatus(20, { time: 292 }),
		playerStatus(25, { time: 287 }),
	]);
	const anySpecial = built[0]!.match.playerStatus!.samples.map((sample) =>
		sample.special.flat().some(Boolean),
	);
	assert.deepEqual(anySpecial, [false, false, false]);
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

test("a Turf War match drops its player-status reads too", () => {
	const events = [
		mapStart(0, { mode: "TW" }),
		objective(60),
		playerStatus(61),
		scoreboard(300, { mode: "TW" }),
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

test("a Turf War match still gets its minimap-sourced status samples", () => {
	const events = [
		mapStart(0, { mode: "TW" }),
		objective(60),
		playerStatus(61),
		minimap(90, { spectator: false, dead: [[0], []] }),
		scoreboard(300, { mode: "TW" }),
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
		{ ...teammate(ALPHA[1]!), name: "w2", dead: true },
		{ ...teammate(ALPHA[0]!), name: "w1" },
		{ ...teammate(ALPHA[3]!), name: "w4" },
		{ ...teammate(ALPHA[2]!), name: "w3" },
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

test("pov diamond cards match OCR-garbled names to their scoreboard rows", () => {
	// attested (六兆年… VoD, Hagglefish TC): the scoreboard reads サンバイザー as
	// サンバイザ_ and the first readable card name carries trailing noise, so no
	// exact match placed either and the leftovers swapped by drawn order
	const names = [
		"ロブ",
		"サンバイザ_",
		"バンダナ",
		"スウェット",
		"l1",
		"l2",
		"l3",
		"l4",
	];
	const diamond = (
		t: number,
		cards: { name: string | null; dead?: boolean; self?: boolean }[],
	): DetectedEvent => {
		const data: MinimapData = {
			stage: 0 as StageId,
			spectator: false,
			teammates: cards.map((card) => ({
				...teammate(null),
				name: card.name,
				dead: card.dead ?? false,
				self: card.self ?? false,
			})),
			enemies: BRAVO.map((id) => enemy(id)),
			teamColors: [null, null],
		};
		return { type: "Minimap", t, confidence: 0.8, data };
	};
	const built = buildScannerMatches([
		mapStart(0),
		diamond(90, [
			{ name: null, dead: true },
			{ name: "サンバイザー" },
			{ name: "ロブ" },
			{ name: null, dead: true, self: true },
		]),
		diamond(120, [
			{ name: "スウェット ‘" },
			{ name: "サンバイザー" },
			{ name: "ロブ" },
			{ name: "バンダナ", self: true },
		]),
		scoreboard(300, { names, povIndex: 2 }),
	]);
	const sample = built[0]!.match.playerStatus!.samples[0]!;
	assert.deepEqual(sample.dead, [
		[false, false, true, true],
		[false, false, false, false],
	]);
});

function kill(
	t: number,
	names: (string | null)[],
	{ time = (300 - Math.round(t)) as number | null } = {},
): DetectedEvent {
	const data: KillData = { time, names };
	return { type: "Kill", t, confidence: 0.9, data };
}

test("kill reads become one kill per row entering the stack", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(60, ["24K"]),
		kill(61, ["datkid", "24K"]),
		kill(65, ["datkid"]),
		scoreboard(300),
	]);
	assert.deepEqual(built[0]!.match.kills, [
		{ t: 60, time: 240, name: "24K" },
		{ t: 61, time: 239, name: "datkid" },
	]);
});

test("a repeated name past the row lifetime is a fresh kill", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(60, ["24K"]),
		kill(75, ["24K"]),
		scoreboard(300),
	]);
	assert.deepEqual(
		built[0]!.match.kills!.map((k) => k.t),
		[60, 75],
	);
});

test("a wobbling read of a persisting row is not a new kill", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(60, ["datkid"]),
		kill(63, ["datkíd"]),
		scoreboard(300),
	]);
	assert.equal(built[0]!.match.kills!.length, 1);
});

test("an unreadable row still counts as a kill", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(60, [null]),
		scoreboard(300),
	]);
	assert.deepEqual(built[0]!.match.kills, [{ t: 60, time: 240, name: null }]);
});

test("kill reads off a replay wipe are dropped", () => {
	const built = buildScannerMatches([
		mapStart(0),
		objective(60),
		objective(70),
		objective(80),
		kill(65, ["24K"]),
		// a broadcast re-running the 3:30 moment at t=200
		kill(200, ["datkid"], { time: 210 }),
		scoreboard(300),
	]);
	assert.deepEqual(
		built[0]!.match.kills!.map((k) => k.name),
		["24K"],
	);
});

test("kills survive on a known non-SZ match", () => {
	const built = buildScannerMatches([
		mapStart(0, { mode: "TC" }),
		kill(60, ["24K"]),
		scoreboard(300, { mode: "TC" }),
	]);
	assert.equal(built[0]!.match.kills!.length, 1);
});

test("a match with no kill reads has null kills", () => {
	const built = buildScannerMatches([mapStart(0), scoreboard(300)]);
	assert.equal(built[0]!.match.kills, null);
});

test("a read that misses an inner row does not recount the rows it drops", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(50, ["Z"]),
		// Z's pill blurred: the bottom-up scan stops after the new row
		kill(50.5, ["X"]),
		kill(51, ["X", "Z"]),
		scoreboard(300),
	]);
	assert.deepEqual(
		built[0]!.match.kills!.map((k) => [k.t, k.name]),
		[
			[50, "Z"],
			[50, "X"],
		],
	);
});

test("the same name twice in one stack is two kills", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(60, ["A", "A"]),
		kill(61, ["A", "A"]),
		scoreboard(300),
	]);
	assert.equal(built[0]!.match.kills!.length, 2);
});

test("a same-name stack seen again inside the row lifetime is the same row", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(60, ["A"]),
		kill(64, ["A"]),
		scoreboard(300),
	]);
	assert.equal(built[0]!.match.kills!.length, 1);
});

test("a row entering unread does not take the place of the named row above it", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(10, ["A"]),
		kill(12, [null, "A"]),
		kill(13, ["C", "A"]),
		scoreboard(300),
	]);
	assert.deepEqual(
		built[0]!.match.kills!.map((k) => [k.t, k.name]),
		[
			[10, "A"],
			[12, "C"],
		],
	);
});

test("an unread row keeps its kill when a later read cannot name it either", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(10, ["A"]),
		kill(12, [null, "A"]),
		kill(13, [null, "A"]),
		scoreboard(300),
	]);
	assert.deepEqual(
		built[0]!.match.kills!.map((k) => [k.t, k.name]),
		[
			[10, "A"],
			[12, null],
		],
	);
});

test("unbacked matches are left out by default", () => {
	const built = buildScannerMatches([
		mapStart(0),
		kill(60, ["A"]),
		mapStart(400),
		kill(460, ["B"]),
	]);
	assert.deepEqual(built, []);
});

test("unbacked matches are emitted flagged on request, map intro opened or orphaned", () => {
	const built = buildScannerMatches(
		[
			kill(20, ["Z"]),
			mapStart(30),
			kill(60, ["A"]),
			mapStart(400),
			kill(460, ["B"]),
			scoreboard(700),
			kill(800, ["C"]),
		],
		undefined,
		{ unbacked: true },
	);
	assert.deepEqual(
		built.map((b) => [b.unbacked ?? false, b.match.kills?.map((k) => k.name)]),
		[
			[true, ["Z"]],
			[true, ["A"]],
			[false, ["B"]],
			[true, ["C"]],
		],
	);
});

test("unbacked matches without kill reads are not emitted", () => {
	const built = buildScannerMatches([mapStart(0), mapStart(400)], undefined, {
		unbacked: true,
	});
	assert.deepEqual(built, []);
});

function counterReads(from: number, to: number): DetectedEvent[] {
	const reads: DetectedEvent[] = [];
	for (let t = from; t <= to; t += 10) {
		reads.push(objective(t, { time: 300 - (t - from) }));
	}
	return reads;
}

test("a map intro with a minute of counter reads backs a match without a results screen", () => {
	const built = buildScannerMatches([mapStart(0), ...counterReads(10, 200)]);
	assert.equal(built.length, 1);
	assert.equal(built[0]!.match.winner, null);
	assert.equal(built[0]!.match.endsAt, 200);
	assert.equal(ingestSkipReasons(built).get(built[0]!), "noPlayers");
});

test("a map intro with under a minute of counter reads backs no match", () => {
	assert.deepEqual(
		buildScannerMatches([mapStart(0), ...counterReads(10, 60)]),
		[],
	);
});

test("a map intro right after a replay-browser entry plays that replay back", () => {
	const built = buildScannerMatches([
		replayScoreboard(0, { paints: GAME_PAINTS }),
		mapStart(8),
		...counterReads(20, 280),
		replayScoreboard(290, { paints: GAME_PAINTS }),
	]);
	assert.equal(built.length, 1);
	assert.equal(isHistoryOnly(built[0]!), false);
	assert.equal(built[0]!.match.lobby, "PRIVATE");
	assert.equal(built[0]!.match.replayCode, "RABC-DEFG-HIJK-LMNO");
	assert.equal(built[0]!.match.endsAt, 290);
	assert.ok(built[0]!.match.objective);
});

test("replays played back one after another each join their own entry", () => {
	const built = buildScannerMatches([
		replayScoreboard(0, { paints: GAME_PAINTS }),
		mapStart(8),
		...counterReads(20, 280),
		replayScoreboard(290, { paints: OTHER_GAME_PAINTS, stage: 1 }),
		mapStart(297, { stage: 1 }),
		...counterReads(310, 570),
	]);
	assert.deepEqual(
		built.map((b) => [b.match.stage, b.match.endsAt, isHistoryOnly(b)]),
		[
			[0, 280, false],
			[1, 570, false],
		],
	);
});

test("a map intro of another stage or long after a replay-browser entry leaves the entry alone", () => {
	for (const intro of [mapStart(8, { stage: 1 }), mapStart(120)]) {
		const built = buildScannerMatches([
			replayScoreboard(0, { paints: GAME_PAINTS }),
			intro,
			...counterReads(130, 300),
		]);
		assert.deepEqual(built.map(isHistoryOnly), [true, false]);
	}
});
