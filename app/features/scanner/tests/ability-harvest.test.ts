/**
 * harvestAbilities: deaths are matched to a scoreboard row by name/weapon,
 * ambiguous matches left unattributed. harvestCardMains puts minimap cards
 * through the same matching.
 */

import assert from "node:assert/strict";
import type {
	AbilityWithUnknown,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import {
	type GearMains,
	harvestAbilities,
	harvestCardMains,
} from "../core/ability-harvest";
import type { DeathData } from "../core/detectors/death/index";
import { test } from "./node-test-compat";

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
	name: string | null,
	weaponId: MainWeaponId | null,
	abilities: AbilityWithUnknown[][] = GRID_A,
): DeathData {
	return {
		weaponId,
		weaponType: weaponId !== null ? "MAIN" : null,
		abilities,
		name,
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
	const abilities = harvestAbilities(PLAYERS, [
		death("Bravo", 50), // name+weapon → index 1, not the other 50 at index 3
		death("charlie ", null, GRID_B), // unique name alone (case/space-insensitive) → 2
		death("garbled", 70), // unique weapon despite misread name → 4
	]);
	assert.deepEqual(abilities.get(1), GRID_A);
	assert.deepEqual(abilities.get(2), GRID_B);
	assert.deepEqual(abilities.get(4), GRID_A);
	assert.equal(abilities.size, 3);
});

test("ambiguous weapon with unknown name stays unattributed", () => {
	const abilities = harvestAbilities(PLAYERS, [death("garbled", 50)]);
	assert.equal(abilities.size, 0);
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
