/**
 * Unit tests for connectAbilities: deaths are attributed to the next
 * scoreboard event and matched to a player row by name/weapon, with
 * ambiguous matches (two players on the same weapon, misread name)
 * left unattributed. harvestCardMains puts minimap cards through the same
 * matching, merging their gear mains across the match's frames.
 */

import assert from "node:assert/strict";
import type {
	AbilityWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import {
	connectAbilities,
	type GearMains,
	harvestCardMains,
} from "../core/ability-harvest";
import {
	DEATH_EVENT_TYPE,
	type DeathData,
} from "../core/detectors/death/index";
import { SCOREBOARD_EVENT_TYPE } from "../core/detectors/scoreboard/index";
import type { DetectedEvent } from "../core/detectors/types";
import test from "./node-test-compat";

const GRID_A: AbilityWithUnknown[][] = [
	["ISM", "ISM", "ISM", "ISM"],
	["RSU", "RSU", "RSU", "RSU"],
	["SSU", "SSU", "SSU", "SSU"],
];
const GRID_B: AbilityWithUnknown[][] = [
	["QR", "QR", "QR", "QR"],
	["QSJ", "QSJ", "QSJ", "QSJ"],
	["IRU", "IRU", "IRU", "IRU"],
];

function player(name: string, weaponId: MainWeaponId) {
	return { name, weaponId, paint: null, ka: null, d: null, s: null };
}

function death(
	t: number,
	name: string | null,
	weaponId: MainWeaponId | null,
	abilities: AbilityWithUnknown[][] = GRID_A,
): DetectedEvent<DeathData> {
	return {
		type: DEATH_EVENT_TYPE,
		t,
		confidence: 0.9,
		data: {
			weaponId,
			weaponType: weaponId !== null ? "MAIN" : null,
			abilities,
			name,
		},
	};
}

function scoreboard(
	t: number,
	players: ReturnType<typeof player>[],
): DetectedEvent {
	return {
		type: SCOREBOARD_EVENT_TYPE,
		t,
		confidence: 0.9,
		data: {
			lobby: null,
			mode: null,
			stage: null,
			scores: [null, null],
			players,
		},
	};
}

const PLAYERS = [
	player("Alpha", 40),
	player("Bravo", 50),
	player("Charlie", 60),
	player("Delta", 50),
	player("Echo", 70),
	player("Foxtrot", 80),
	player("Golf", 90),
	player("Hotel", 100),
];

test("matches by name+weapon, unique name, and unique weapon", () => {
	const board = scoreboard(100, PLAYERS);
	const map = connectAbilities([
		death(10, "Bravo", 50), // name+weapon → index 1, not the other 50 at index 3
		death(20, "charlie ", null, GRID_B), // unique name alone (case/space-insensitive) → 2
		death(30, "garbled", 70), // unique weapon despite misread name → 4
		board,
	]);
	const abilities = map.get(board);
	assert.ok(abilities);
	assert.deepEqual(abilities.get(1), GRID_A);
	assert.deepEqual(abilities.get(2), GRID_B);
	assert.deepEqual(abilities.get(4), GRID_A);
	assert.equal(abilities.size, 3);
});

test("ambiguous weapon with unknown name stays unattributed", () => {
	const board = scoreboard(100, PLAYERS);
	const map = connectAbilities([death(10, "garbled", 50), board]);
	assert.equal(map.get(board), undefined);
});

test("deaths only attach to the next scoreboard", () => {
	const board1 = scoreboard(100, PLAYERS);
	const board2 = scoreboard(400, PLAYERS);
	const map = connectAbilities([
		death(10, "Alpha", 40),
		board1,
		death(200, "Echo", 70, GRID_B),
		board2,
	]);
	assert.deepEqual(map.get(board1)?.get(0), GRID_A);
	assert.equal(map.get(board1)?.get(4), undefined);
	assert.deepEqual(map.get(board2)?.get(4), GRID_B);
	assert.equal(map.get(board2)?.get(0), undefined);
});

test("unsorted input is handled and trailing deaths are dropped", () => {
	const board = scoreboard(100, PLAYERS);
	const map = connectAbilities([
		death(150, "Alpha", 40), // after the scoreboard — belongs to a match never finished
		board,
		death(10, "Hotel", 100, GRID_B),
	]);
	const abilities = map.get(board);
	assert.ok(abilities);
	assert.deepEqual(abilities.get(7), GRID_B);
	assert.equal(abilities.size, 1);
});

function card(
	name: string | null,
	weaponId: MainWeaponId | null,
	abilities: GearMains,
) {
	return { name, weaponId, abilities };
}

test("cards match rows by name and weapon like deaths do", () => {
	const mains = harvestCardMains(PLAYERS, [
		card("Bravo", 50, ["ISM", "RSU", "SSU"]), // name+weapon → 1, not the 50 at 3
		card(null, 70, ["QR", "QSJ", "IRU"]), // unique weapon, nameless enemy card → 4
		card("garbled", 50, ["LDE", "LDE", "LDE"]), // ambiguous weapon → dropped
	]);
	assert.deepEqual(mains.get(1), ["ISM", "RSU", "SSU"]);
	assert.deepEqual(mains.get(4), ["QR", "QSJ", "IRU"]);
	assert.equal(mains.size, 2);
});

test("each gear slot keeps the first identified badge across frames", () => {
	const mains = harvestCardMains(PLAYERS, [
		card("Alpha", 40, [null, "UNKNOWN", "SSU"]),
		card("Alpha", 40, ["ISM", "RSU", "QR"]),
	]);
	assert.deepEqual(mains.get(0), ["ISM", "RSU", "SSU"]);
});

test("cards that identified no badge at all are left out", () => {
	const mains = harvestCardMains(PLAYERS, [
		card("Alpha", 40, []),
		card("Echo", 70, [null, null, null]),
	]);
	assert.equal(mains.size, 0);
});
