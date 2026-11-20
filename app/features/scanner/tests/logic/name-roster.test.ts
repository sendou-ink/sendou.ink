import { describe, expect, test } from "vitest";
import * as NameRoster from "../../core/name-roster";

const TEAM_A = ["Sendou", "Kiver", "Brian", "Zed"];
const TEAM_B = ["Gossip", "Noah", "Alice", "Bobby"];
const TEAM_C = ["Totoro", "Misono", "Ramen", "Udon"];

describe("NameRoster.snapNames", () => {
	test("a name one game of a set misread takes the spelling the others read", () => {
		expect(
			NameRoster.snapNames([
				[TEAM_A, TEAM_B],
				[TEAM_A.with(1, "Kiuer"), TEAM_B],
				[TEAM_B, TEAM_A],
			])[1],
		).toEqual([TEAM_A, TEAM_B]);
	});

	test("a lone reading against a lone reading keeps both", () => {
		const games = [
			[TEAM_A, TEAM_B],
			[TEAM_A.with(1, "Kiuer"), TEAM_B],
		];
		expect(NameRoster.snapNames(games)).toEqual(games);
	});

	test("two rival spellings read equally often leave the reading alone", () => {
		const games = [
			[TEAM_A.with(1, "Kiuer"), TEAM_B],
			[TEAM_A.with(1, "Kiuer"), TEAM_B],
			[TEAM_A.with(1, "Kiwer"), TEAM_B],
			[TEAM_A, TEAM_B],
			[TEAM_A, TEAM_B],
		];
		expect(NameRoster.snapNames(games)[2]![0]![1]).toBe("Kiwer");
	});

	test("a near name in a team sharing one other player with the others keeps its spelling", () => {
		const games = [
			[TEAM_A, TEAM_B],
			[TEAM_A, TEAM_B],
			[["Sendou", "Kiuer", "Pearl", "Marina"], TEAM_C],
		];
		expect(NameRoster.snapNames(games)[2]![0]![1]).toBe("Kiuer");
	});

	test("a team carries the vote across opponents and a sub", () => {
		const games = [
			[TEAM_A, TEAM_B],
			[TEAM_A, TEAM_C],
			[TEAM_A.with(1, "Kiuer").with(3, "Pearl"), [null, null, null, null]],
		];
		expect(NameRoster.snapNames(games)[2]![0]![1]).toBe("Kiver");
	});

	test("opponents of games linked by one team never vote on each other", () => {
		const games = [
			[TEAM_A, TEAM_B],
			[TEAM_A, TEAM_B],
			[TEAM_A, TEAM_C.with(3, "Bobbi")],
		];
		expect(NameRoster.snapNames(games)[2]![1]![3]).toBe("Bobbi");
	});

	test("a name never takes the spelling of another player of its game", () => {
		const games = [
			[["Kira", "Kiro", "Brian", "Zed"], TEAM_B],
			[["Kira", "Kira", "Brian", "Zed"], TEAM_B],
			[["Kira", "Kira", "Brian", "Zed"], TEAM_B],
		];
		expect(NameRoster.snapNames(games)[0]![0]!.slice(0, 2)).toEqual([
			"Kira",
			"Kiro",
		]);
	});

	test("a reading the pairing forgives as tail damage casts no vote", () => {
		const games = [
			[TEAM_A.with(3, "Teddy"), TEAM_B],
			[TEAM_A.with(3, "Teddy"), TEAM_B],
			[TEAM_A.with(3, "Tee"), TEAM_B],
		];
		expect(NameRoster.snapNames(games)[2]![0]![3]).toBe("Tee");
	});

	test("a case twin follows the set", () => {
		const games = [
			[TEAM_A.with(0, "sendou"), TEAM_B],
			[TEAM_A, TEAM_B],
			[TEAM_A, TEAM_B],
		];
		expect(NameRoster.snapNames(games)[0]![0]![0]).toBe("Sendou");
	});

	test("unread names stay unread", () => {
		const games = [
			[TEAM_A, [null, null, null, null]],
			[TEAM_A, TEAM_B],
		];
		expect(NameRoster.snapNames(games)).toEqual(games);
	});
});
