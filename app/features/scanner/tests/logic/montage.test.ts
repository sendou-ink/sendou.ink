import { describe, expect, test } from "vitest";
import {
	candidatesByBaseWeapon,
	candidateTeamIds,
	FAST_FORWARD_SPEED,
	type MontageManifestTopTeam,
	montageTeamSections,
	montageWindows,
	playbackDuration,
	playbackSegments,
} from "../../core/montage";

const FF = FAST_FORWARD_SPEED;

describe("playbackSegments", () => {
	test.each([
		{
			why: "kills close together play at normal speed",
			clip: { start: 95, end: 121, killTimes: [100, 105, 110, 117] },
			expected: [{ from: 95, to: 121, speed: 1 }],
		},
		{
			why: "a long gap fast-forwards 3 s after the kill until 3 s before the next",
			clip: { start: 95, end: 134, killTimes: [100, 102, 104, 130] },
			expected: [
				{ from: 95, to: 107, speed: 1 },
				{ from: 107, to: 127, speed: FF },
				{ from: 127, to: 134, speed: 1 },
			],
		},
		{
			why: "dead time shorter than the minimum stays at normal speed",
			clip: { start: 95, end: 118, killTimes: [100, 101, 102, 109] },
			expected: [{ from: 95, to: 118, speed: 1 }],
		},
		{
			why: "every long gap fast-forwards on its own",
			clip: { start: 95, end: 139, killTimes: [100, 112, 124, 135] },
			expected: [
				{ from: 95, to: 103, speed: 1 },
				{ from: 103, to: 109, speed: FF },
				{ from: 109, to: 115, speed: 1 },
				{ from: 115, to: 121, speed: FF },
				{ from: 121, to: 127, speed: 1 },
				{ from: 127, to: 132, speed: FF },
				{ from: 132, to: 139, speed: 1 },
			],
		},
	])("$why", ({ clip, expected }) => {
		expect(playbackSegments(clip)).toEqual(expected);
	});
});

describe("playbackDuration", () => {
	test("fast-forwarded seconds count by their speed", () => {
		expect(
			playbackDuration([
				{ from: 0, to: 10, speed: 1 },
				{ from: 10, to: 18, speed: 4 },
			]),
		).toBe(12);
	});
});

describe("montageWindows", () => {
	const game = (...killTimes: number[]) => ({
		kills: killTimes.map((t) => ({ t, time: null, name: null })),
		deaths: [],
	});
	const criteria = {
		minKills: 3,
		maxSecondsByKills: { 2: 20, 3: 30, 4: 45, 5: 60 },
	};
	const spans = (windows: ReturnType<typeof montageWindows>) =>
		windows.map((window) => [window.start, window.end, window.kills]);

	test.each([
		{
			why: "a 3-splat streak within its cap",
			kills: [100, 110, 120],
			expected: [[95, 123, 3]],
		},
		{
			why: "a 3-splat streak over its cap",
			kills: [100, 112, 124],
			expected: [],
		},
		{
			why: "a 4-splat streak may run longer than a 3-splat one",
			kills: [100, 112, 124, 136],
			expected: [[95, 139, 4]],
		},
		{
			why: "a streak longer than the last count uses its cap",
			kills: [100, 108, 116, 124, 132, 140],
			expected: [[95, 143, 6]],
		},
		{
			why: "streaks under the minimum are left out",
			kills: [100, 105],
			expected: [],
		},
	])("$why", ({ kills, expected }) => {
		expect(spans(montageWindows(game(...kills), criteria))).toEqual(expected);
	});

	test("the best reading of a streak wins and splats aren't shared", () => {
		// all five fit 60 s; their first three alone would also fit 30 s
		const windows = montageWindows(game(100, 105, 110, 125, 140), criteria);

		expect(spans(windows)).toEqual([[95, 143, 5]]);
	});
});

describe("candidatesByBaseWeapon", () => {
	test("groups variants under their base weapon in order of their first candidate, unknown last", () => {
		const candidates = [
			{ id: "a", weaponId: null },
			{ id: "b", weaponId: 41 },
			{ id: "c", weaponId: 210 },
			{ id: "d", weaponId: 40 },
		] as const;

		expect(
			candidatesByBaseWeapon(candidates).map((group) => [
				group.baseWeaponId,
				group.candidates.map((candidate) => candidate.id),
			]),
		).toEqual([
			[40, ["b", "d"]],
			[210, ["c"]],
			[null, ["a"]],
		]);
	});
});

describe("candidateTeamIds", () => {
	const topTeamIds = new Set([1, 2]);
	const side = (id: number) => ({ id, name: `Team ${id}`, logo: null });

	test.each([
		{
			why: "a POV VoD plays under its team",
			vod: { team: side(1), teams: [side(1), side(2)] },
			expected: [1],
		},
		{
			why: "a cast plays under either top team",
			vod: { team: null, teams: [side(1), side(2)] },
			expected: [1, 2],
		},
		{
			why: "teams outside the top are left out",
			vod: { team: null, teams: [side(2), side(3)] },
			expected: [2],
		},
		{
			why: "a POV VoD of a team outside the top plays under none",
			vod: { team: side(3), teams: [side(3), side(1)] },
			expected: [],
		},
	])("$why", ({ vod, expected }) => {
		expect(candidateTeamIds(vod, topTeamIds)).toEqual(expected);
	});
});

describe("montageTeamSections", () => {
	test("counts down from the last placement, each team with its picks in order", () => {
		const topTeams = [1, 2, 3].map(
			(id): MontageManifestTopTeam => ({
				id,
				name: `Team ${id}`,
				logo: null,
				players: [],
				placement: id,
			}),
		);
		const picks = [
			{ key: "a", teamId: 1 },
			{ key: "b", teamId: 3 },
			{ key: "c", teamId: 1 },
		];

		expect(
			montageTeamSections(topTeams, picks).map((section) => [
				section.team.id,
				section.picks.map((pick) => pick.key),
			]),
		).toEqual([
			[3, ["b"]],
			[2, []],
			[1, ["a", "c"]],
		]);
	});
});
