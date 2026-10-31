import { describe, expect, test } from "vitest";
import type { BroadcastTeam } from "../broadcast-types";
import * as TeamOverrides from "./TeamOverrides";

const team: BroadcastTeam = {
	id: 1,
	name: "Team One",
	logoUrl: null,
	seed: 1,
	isEdited: false,
	players: [
		{
			userId: 10,
			name: "Ten",
			avatarUrl: null,
			isSub: false,
			isActive: null,
			weapons: [0, 10],
		},
		{
			userId: 11,
			name: "Eleven",
			avatarUrl: null,
			isSub: false,
			isActive: null,
			weapons: [20],
		},
	],
};

const defaults: TeamOverrides.TeamValues = {
	name: team.name,
	players: team.players.map(({ userId, name, weapons }) => ({
		userId,
		name,
		weapons,
	})),
};

describe("TeamOverrides.apply", () => {
	test("shows the edited values over the tournament's", () => {
		const applied = TeamOverrides.apply(team, {
			teams: { 1: { name: "Renamed" } },
			players: { 11: { weapons: [40] } },
		});

		expect(applied.name).toBe("Renamed");
		expect(applied.players[0]).toEqual(team.players[0]);
		expect(applied.players[1]).toEqual({ ...team.players[1], weapons: [40] });
		expect(applied.isEdited).toBe(true);
	});

	test("ignores overrides of other teams and their players", () => {
		const applied = TeamOverrides.apply(team, {
			teams: { 2: { name: "Other" } },
			players: { 20: { name: "Other player" } },
		});

		expect(applied).toEqual(team);
	});
});

describe("TeamOverrides.fromSubmitted", () => {
	test("stores nothing when the submitted values are the tournament's", () => {
		expect(
			TeamOverrides.fromSubmitted({ defaults, submitted: defaults }),
		).toEqual({
			team: null,
			players: [
				{ userId: 10, override: null },
				{ userId: 11, override: null },
			],
		});
	});

	test("stores only the fields that differ", () => {
		const overrides = TeamOverrides.fromSubmitted({
			defaults,
			submitted: {
				name: "Renamed",
				players: [
					{ userId: 10, name: "Ten", weapons: [10, 0] },
					{ userId: 11, name: "Eleventh", weapons: [20] },
				],
			},
		});

		expect(overrides).toEqual({
			team: { name: "Renamed" },
			players: [
				{ userId: 10, override: { weapons: [10, 0] } },
				{ userId: 11, override: { name: "Eleventh" } },
			],
		});
	});

	test("ignores submitted players not on the team", () => {
		const overrides = TeamOverrides.fromSubmitted({
			defaults,
			submitted: {
				...defaults,
				players: [
					...defaults.players,
					{ userId: 99, name: "Intruder", weapons: [] },
				],
			},
		});

		expect(overrides.players.map((player) => player.userId)).toEqual([10, 11]);
	});
});
