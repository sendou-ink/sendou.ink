import assert from "node:assert/strict";
import {
	buildIngestBatches,
	chunkIngestBatches,
	type IngestScoreboardPlayer,
} from "../core/batches";
import type { DeathData } from "../core/detectors/death/index";
import type { ScoreboardData } from "../core/detectors/scoreboard/index";
import type { DetectedEvent } from "../core/detectors/types";
import type { ScannerAbility, ScannerLobby } from "../scanner-types";
import test from "./node-test-compat";

const NAMES = ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"];

function mapStart(t: number): DetectedEvent {
	return {
		type: "MapStart",
		t,
		confidence: 0.9,
		data: { mode: "SZ", stage: 0 },
	};
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

function scoreboard(
	t: number,
	{ lobby = "PRIVATE" as ScannerLobby | null } = {},
): DetectedEvent {
	const data: ScoreboardData = {
		lobby,
		mode: "SZ",
		stage: 0,
		scores: [100, 47],
		players: NAMES.map((name) => ({
			name,
			weaponId: 40,
			paint: 1000,
			ka: 10,
			d: 5,
			s: 2,
		})),
		povIndex: 0,
	};
	return { type: "Scoreboard", t, confidence: 0.9, data };
}

function scoreboardPlayers(batch: DetectedEvent[]): IngestScoreboardPlayer[] {
	return (batch.at(-1)!.data as ScoreboardData).players;
}

test("groups map start, deaths and scoreboard into one batch", () => {
	const batches = buildIngestBatches([
		mapStart(0),
		death(60, "l2"),
		death(120, "l3"),
		scoreboard(300),
	]);
	assert.equal(batches.length, 1);
	assert.deepEqual(
		batches[0]!.map((e) => e.type),
		["MapStart", "Death", "Death", "Scoreboard"],
	);
});

test("enriches the scoreboard players with abilities from the batch's deaths", () => {
	const build: ScannerAbility[][] = [
		["ISM", "ISS", "ISS", "ISS"],
		["QR", "QSJ", "QSJ", "QSJ"],
		["SSU", "RSU", "RSU", "RSU"],
	];
	const batches = buildIngestBatches([
		mapStart(0),
		death(60, "l2", build),
		scoreboard(300),
	]);
	const players = scoreboardPlayers(batches[0]!);
	assert.deepEqual(players[5]!.abilities, build);
	assert.equal(players[0]!.abilities, undefined);
});

test("deaths from an earlier match do not leak into the next batch", () => {
	const batches = buildIngestBatches([
		mapStart(0),
		death(60, "l2"),
		scoreboard(300),
		mapStart(400),
		scoreboard(700),
	]);
	assert.equal(batches.length, 2);
	assert.equal(scoreboardPlayers(batches[1]!)[5]!.abilities, undefined);
});

test("a scoreboard without a preceding map start claims the last 10 minutes of deaths", () => {
	const batches = buildIngestBatches([death(60, "l2"), scoreboard(300)]);
	assert.equal(batches.length, 1);
	assert.deepEqual(
		batches[0]!.map((e) => e.type),
		["Death", "Scoreboard"],
	);
	assert.notEqual(scoreboardPlayers(batches[0]!)[5]!.abilities, undefined);
});

test("deaths older than 10 minutes do not join a map-start-less batch", () => {
	const batches = buildIngestBatches([
		death(60, "l2"),
		death(700, "l3"),
		scoreboard(1000),
	]);
	assert.equal(batches.length, 1);
	assert.deepEqual(
		batches[0]!.map((e) => e.t),
		[700, 1000],
	);
});

test("the fallback window does not reach past the previous scoreboard", () => {
	const batches = buildIngestBatches([
		mapStart(0),
		death(60, "l2"),
		scoreboard(300),
		death(400, "l3"),
		scoreboard(700),
	]);
	assert.equal(batches.length, 2);
	assert.deepEqual(
		batches[1]!.map((e) => e.t),
		[400, 700],
	);
});

test("non-private-battle scoreboards are dropped together with their batch", () => {
	const batches = buildIngestBatches([
		mapStart(0),
		death(60, "l2"),
		scoreboard(300, { lobby: "X" }),
		mapStart(400),
		scoreboard(700),
	]);
	assert.equal(batches.length, 1);
	assert.deepEqual(
		batches[0]!.map((e) => e.type),
		["MapStart", "Scoreboard"],
	);
});

test("an unreadable lobby is kept", () => {
	const batches = buildIngestBatches([scoreboard(300, { lobby: null })]);
	assert.equal(batches.length, 1);
});

test("a match whose scoreboard was missed is dropped on the next map start", () => {
	const batches = buildIngestBatches([
		mapStart(0),
		death(60, "l2"),
		mapStart(400),
		death(460, "l3"),
		scoreboard(700),
	]);
	assert.equal(batches.length, 1);
	assert.deepEqual(
		batches[0]!.map((e) => e.t),
		[400, 460, 700],
	);
});

test("a trailing match without a scoreboard is not sent", () => {
	const batches = buildIngestBatches([mapStart(0), death(60, "l2")]);
	assert.equal(batches.length, 0);
});

test("event types the endpoint does not accept are excluded", () => {
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
	const batches = buildIngestBatches([mapStart(0), own, scoreboard(300), own]);
	assert.equal(batches.length, 1);
	assert.deepEqual(
		batches[0]!.map((e) => e.type),
		["MapStart", "Scoreboard"],
	);
});

test("chunkIngestBatches: packs whole batches up to the event cap", () => {
	const batches = [
		[mapStart(0), death(60, "l1"), scoreboard(300)],
		[mapStart(400), scoreboard(700)],
		[mapStart(800), scoreboard(1100)],
	];
	const chunks = chunkIngestBatches(batches, 5);
	assert.deepEqual(
		chunks.map((chunk) => chunk.map((batch) => batch.length)),
		[[3, 2], [2]],
	);
	// batches are kept whole and in order
	assert.deepEqual(chunks.flat(), batches);
});

test("chunkIngestBatches: everything fits in one request", () => {
	const batches = [
		[mapStart(0), scoreboard(300)],
		[mapStart(400), scoreboard(700)],
	];
	assert.deepEqual(chunkIngestBatches(batches, 1000), [batches]);
});

test("chunkIngestBatches: an oversized lone batch still gets a chunk", () => {
	const big = [mapStart(0), death(1, "l1"), death(2, "l2"), scoreboard(300)];
	assert.deepEqual(chunkIngestBatches([big], 2), [[big]]);
});

test("chunkIngestBatches: no batches, no requests", () => {
	assert.deepEqual(chunkIngestBatches([], 1000), []);
});
