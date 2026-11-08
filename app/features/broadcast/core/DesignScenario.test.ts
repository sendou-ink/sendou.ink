import { describe, expect, test } from "vitest";
import { Config } from "~/config";
import { broadcastDesignSearchParams } from "../broadcast-search-params";
import type { BroadcastBracket } from "../broadcast-types";
import { broadcastDesignImageUrl } from "../broadcast-urls";
import * as DesignScenario from "./DesignScenario";

const DEFAULT_SCENARIO = broadcastDesignSearchParams.parse(
	new URLSearchParams(),
);

const build = (scenario: Partial<DesignScenario.Scenario> = {}) =>
	DesignScenario.build({
		scenario: { ...DEFAULT_SCENARIO, ...scenario },
		tournament: { name: "In The Zone", logoUrl: "/logo.png" },
		settings: {
			css: "",
			weaponImages: "default",
			headline: "",
			casterIds: [],
		},
		takenAt: 0,
	});

describe("DesignScenario.build", () => {
	test("puts the scenario's scene on air", () => {
		const state = build({ scene: "bracket" });

		expect(state.live.scene).toBe("bracket");
		expect(state.next.scene).toBe("bracket");
	});

	test.each([
		{ set: "start", bestOf: 5, scores: [0, 0], isOver: false },
		{ set: "ongoing", bestOf: 5, scores: [1, 1], isOver: false },
		{ set: "decider", bestOf: 7, scores: [3, 3], isOver: false },
		{ set: "over", bestOf: 3, scores: [2, 1], isOver: true },
	] as const)(
		"scores the set as $set (Bo$bestOf)",
		({ set, bestOf, scores, isOver }) => {
			const progress = build({ set, bestOf }).match!.progress.live;

			expect(progress.scores).toEqual(scores);
			expect(progress.isOver).toBe(isOver);
			expect(progress.games).toHaveLength(bestOf);
		},
	);

	test("gives the teams names of the scenario's length", () => {
		const short = build({ names: "short" }).match!.teams[0]!.name;
		const long = build({ names: "long" }).match!.teams[0]!.name;

		expect(long.length).toBeGreaterThan(short.length);
	});

	test("gives the teams as many players as the scenario has", () => {
		expect(build({ players: 2 }).match!.teams[1]!.players).toHaveLength(2);
	});

	test("gives the featured teams their real logos and players", () => {
		const team = build().match!.teams[1]!;

		expect(team.logoUrl).toBe(
			broadcastDesignImageUrl("mock/logos/team-olive.webp"),
		);
		expect(team.players[0]!.name).toBe("Sendou");
		expect(team.players[0]!.avatarUrl).not.toBeNull();
	});

	test("puts the tournament's logo on every team with placeholder logos", () => {
		const teams = build({ placeholderLogos: true }).match!.teams;

		expect(teams.map((team) => team?.logoUrl)).toEqual([
			"/logo.png",
			"/logo.png",
		]);
	});

	test.each([
		{ why: "no logo", logoUrl: "" },
		{
			why: "the default logo",
			logoUrl: `https://cdn/${Config.tournamentDefaultLogo}`,
		},
	])("gives a tournament with $why the In The Zone logo", ({ logoUrl }) => {
		const state = DesignScenario.build({
			scenario: DEFAULT_SCENARIO,
			tournament: { name: "In The Zone", logoUrl },
			settings: {
				css: "",
				weaponImages: "default",
				headline: "",
				casterIds: [],
			},
			takenAt: 0,
		});

		expect(state.tournament.logoUrl).toBe(
			broadcastDesignImageUrl("mock/logos/in-the-zone.webp"),
		);
	});

	test("keeps the real players' avatars but not their names with other name lengths", () => {
		const player = build({ names: "long" }).match!.teams[1]!.players[0]!;

		expect(player.name).not.toBe("Sendou");
		expect(player.avatarUrl).not.toBeNull();
	});

	test("leaves out seeds and logos when the scenario does", () => {
		const team = build({ seeds: false, logos: false }).match!.teams[0]!;

		expect(team.seed).toBeNull();
		expect(team.logoUrl).toBeNull();
	});

	test.each([
		{ bracket: "double_elimination", type: "elimination" },
		{ bracket: "single_elimination", type: "elimination" },
		{ bracket: "round_robin", type: "round_robin" },
		{ bracket: "swiss", type: "swiss" },
	] as const)(
		"mocks a $bracket bracket with the featured match in it",
		({ bracket, type }) => {
			const shown = build({ bracket }).bracket.live!;

			expect(shown.type).toBe(type);
			expect(
				bracketMatches(shown).filter((match) => match.isFeatured),
			).toHaveLength(1);
		},
	);

	test("shows the sides of a double elimination bracket the focus is on", () => {
		const shown = build({ bracketFocus: "losers" }).bracket.live!;

		expect(
			shown.type === "elimination" && shown.sides.map((side) => side.type),
		).toEqual(["losers"]);
	});

	test("shows only the rounds still being played when focused on them", () => {
		const remaining = build({ bracketFocus: "remaining" }).bracket.live!;
		const whole = build({ bracketFocus: "whole" }).bracket.live!;

		expect(bracketMatches(remaining).length).toBeLessThan(
			bracketMatches(whole).length,
		);
	});

	test("has as many casters and other matches as the scenario", () => {
		const state = build({ casters: 3, otherMatches: 6 });

		expect(state.casters).toHaveLength(3);
		expect(state.otherMatches).toHaveLength(6);
	});

	test("colors the game in the scenario's ink", () => {
		expect(build({ ink: "pinkGreen" }).ink?.key).toBe("pinkGreen");
		expect(build({ ink: null }).ink).toBeNull();
	});

	test("spotlights the team on the left", () => {
		const state = build({ swapSides: true });

		expect(state.team.live!.team.id).toBe(state.match!.teams[1]!.id);
	});
});

function bracketMatches(bracket: BroadcastBracket) {
	switch (bracket.type) {
		case "elimination":
			return bracket.sides.flatMap((side) =>
				side.rounds.flatMap((round) =>
					round.matches.filter((match) => match !== null),
				),
			);
		case "round_robin":
			return bracket.rounds.flatMap((round) => round.matches);
		case "swiss":
			return bracket.pools.flatMap((pool) => pool.matches);
	}
}
