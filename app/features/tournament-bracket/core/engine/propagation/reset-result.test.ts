import { beforeEach, describe, expect, test } from "vitest";
import { create } from "../create";
import * as Engine from "../index";
import type { BracketData } from "../types";

const SEMIFINAL_ID = 0;
const FINAL_ID = 2;

describe("resetMatchResults", () => {
	let data: BracketData;

	beforeEach(() => {
		data = create({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: null,
		});
		for (const matchId of [0, 1]) {
			data = Engine.reportResult(data, {
				matchId,
				winnerSide: "opponent1",
			}).data;
		}
	});

	test("refuses to reset a result once the next match has started", () => {
		data = Engine.reportResult(data, {
			matchId: FINAL_ID,
			scores: [1, 0],
		}).data;

		expect(() => Engine.resetMatchResults(data, SEMIFINAL_ID)).toThrow(
			"The match is locked.",
		);
	});

	test("saves the match whose result was reset", () => {
		const { changedMatches } = Engine.resetMatchResults(data, SEMIFINAL_ID);

		const semifinal = changedMatches.find((match) => match.id === SEMIFINAL_ID);
		expect(semifinal).toBeDefined();
		expect(semifinal?.winnerSide).toBeNull();
	});
});
