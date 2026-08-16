import { describe, expect, test } from "vitest";
import * as Engine from "./engine";
import { serializeBracket } from "./Tournament.server";
import { testTournament } from "./tests/test-utils";

const SWISS_SETTINGS = { groupCount: 2, roundCount: 3 };

const swissBracket = () => {
	const tournament = testTournament({
		data: Engine.create({
			type: "swiss",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: SWISS_SETTINGS,
		}),
		ctx: {
			settings: {
				bracketProgression: [
					{
						name: "Main Bracket",
						type: "swiss",
						requiresCheckIn: false,
						settings: SWISS_SETTINGS,
					},
				],
			},
		},
	});

	return tournament.bracketByIdx(0)!;
};

describe("serializeBracket", () => {
	test("ships every group's match data by default", () => {
		const bracket = swissBracket();

		const serialized = serializeBracket(bracket);

		expect(serialized.data.match).toEqual(bracket.data.match);
		expect(serialized.data.round).toEqual(bracket.data.round);
	});

	test("ships the match data of one group only", () => {
		const bracket = swissBracket();
		const groupId = bracket.data.group[1].id;

		const serialized = serializeBracket(bracket, { groupId });

		expect(serialized.data.match.length).toBeGreaterThan(0);
		expect(
			serialized.data.match.every((match) => match.groupId === groupId),
		).toBe(true);
		expect(serialized.data.round.length).toBeGreaterThan(0);
		expect(
			serialized.data.round.every((round) => round.groupId === groupId),
		).toBe(true);
	});

	test("ships every group of the bracket so that the view can switch between them", () => {
		const bracket = swissBracket();

		const serialized = serializeBracket(bracket, {
			groupId: bracket.data.group[1].id,
		});

		expect(serialized.data.group).toEqual(bracket.data.group);
	});
});
