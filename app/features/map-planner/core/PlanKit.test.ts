import { describe, expect, test } from "vitest";
import type {
	MainWeaponId,
	SpecialWeaponId,
} from "~/modules/in-game-lists/types";
import {
	BIG_BUBBLER_ID,
	BOOYAH_BOMB_ID,
	CRAB_TANK_ID,
	INK_STORM_ID,
	KILLER_WAIL_ID,
	SPLATTERCOLOR_SCREEN_ID,
	SUPER_CHUMP_ID,
	TACTICOOLER_ID,
	TENTA_MISSILES_ID,
	TRIPLE_INKSTRIKE_ID,
	TRIPLE_SPLASHDOWN_ID,
	TRIZOOKA_ID,
	WAVE_BREAKER_ID,
	ZIPCASTER_ID,
} from "~/modules/in-game-lists/weapon-ids";
import * as PlanKit from "./PlanKit";

describe("PlanKit.isPlacedSpecial", () => {
	test.each([
		{
			why: "Big Bubbler is placed",
			specialWeaponId: BIG_BUBBLER_ID,
			expected: true,
		},
		{
			why: "Tenta Missiles are aimed",
			specialWeaponId: TENTA_MISSILES_ID,
			expected: true,
		},
		{
			why: "Ink Storm is thrown",
			specialWeaponId: INK_STORM_ID,
			expected: true,
		},
		{
			why: "Booyah Bomb is thrown",
			specialWeaponId: BOOYAH_BOMB_ID,
			expected: true,
		},
		{
			why: "Wave Breaker is placed",
			specialWeaponId: WAVE_BREAKER_ID,
			expected: true,
		},
		{
			why: "Killer Wail is placed",
			specialWeaponId: KILLER_WAIL_ID,
			expected: true,
		},
		{
			why: "Triple Inkstrike is aimed",
			specialWeaponId: TRIPLE_INKSTRIKE_ID,
			expected: true,
		},
		{
			why: "Tacticooler is placed",
			specialWeaponId: TACTICOOLER_ID,
			expected: true,
		},
		{
			why: "Super Chump is launched",
			specialWeaponId: SUPER_CHUMP_ID,
			expected: true,
		},
		{
			why: "Splattercolor Screen is placed",
			specialWeaponId: SPLATTERCOLOR_SCREEN_ID,
			expected: true,
		},
		{
			why: "Trizooka is shot from the player",
			specialWeaponId: TRIZOOKA_ID,
			expected: false,
		},
		{
			why: "Zipcaster is the player",
			specialWeaponId: ZIPCASTER_ID,
			expected: false,
		},
		{
			why: "Crab Tank is the player",
			specialWeaponId: CRAB_TANK_ID,
			expected: false,
		},
		{
			why: "Triple Splashdown is the player",
			specialWeaponId: TRIPLE_SPLASHDOWN_ID,
			expected: false,
		},
	])("$why", ({ specialWeaponId, expected }) => {
		expect(PlanKit.isPlacedSpecial(specialWeaponId as SpecialWeaponId)).toBe(
			expected,
		);
	});
});

describe("PlanKit.nextKit", () => {
	test.each([
		{ why: "first kit to the second", weaponId: 40, expected: 41 },
		{ why: "second kit to the third", weaponId: 41, expected: 42 },
		{ why: "last kit back to the first", weaponId: 42, expected: 40 },
		{ why: "alt skin to the next kit of its copy", weaponId: 45, expected: 41 },
	])("$why", ({ weaponId, expected }) => {
		expect(PlanKit.nextKit(weaponId as MainWeaponId)).toBe(expected);
	});
});

describe("PlanKit.rangesOfPlayer", () => {
	test("is the main weapon's reach out of special", () => {
		const [reach, ...rest] = PlanKit.rangesOfPlayer({
			weaponId: 40,
			specialActive: false,
		});

		expect(reach.kind).toBe("reach");
		expect(reach.radius).toBeGreaterThan(0);
		expect(rest).toEqual([]);
	});

	test("is the special's reach and blast in special", () => {
		const outOfSpecial = PlanKit.rangesOfPlayer({
			weaponId: 40,
			specialActive: false,
		});
		const inSpecial = PlanKit.rangesOfPlayer({
			weaponId: 40,
			specialActive: true,
		});

		expect(inSpecial.map((range) => range.kind)).toEqual(["reach", "blast"]);
		expect(inSpecial[0].radius).not.toBe(outOfSpecial[0].radius);
		expect(inSpecial[1].radius).toBeGreaterThan(inSpecial[0].radius);
	});

	test("is empty for a special without a range", () => {
		// Splat Roller: Big Bubbler
		expect(
			PlanKit.rangesOfPlayer({ weaponId: 1010, specialActive: true }),
		).toEqual([]);
	});
});

describe("PlanKit.rangesOfMarker", () => {
	test("is the blast of the owner's sub", () => {
		// Splattershot: Suction Bomb
		const [blast] = PlanKit.rangesOfMarker({ kind: "sub" }, { weaponId: 40 });

		expect(blast.kind).toBe("blast");
		expect(blast.radius).toBeGreaterThan(0);
	});

	test("is the area of a placed special", () => {
		// Dualie Squelchers: Wave Breaker
		expect(
			PlanKit.rangesOfMarker({ kind: "special" }, { weaponId: 5030 }),
		).toHaveLength(1);
	});

	test("is empty for a sub without a blast", () => {
		// Snipewriter 5H: Sprinkler
		expect(PlanKit.rangesOfMarker({ kind: "sub" }, { weaponId: 2070 })).toEqual(
			[],
		);
	});
});
