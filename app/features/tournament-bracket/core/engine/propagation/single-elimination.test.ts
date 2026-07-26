import { describe, expect, test } from "vitest";
import { createResolved } from "../create";
import * as Engine from "../index";
import type { BracketData } from "../types";

describe("Previous and next match update", () => {
	test("should determine matches in consolation final", () => {
		let data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { consolationFinal: true },
		});

		data = Engine.reportResult(data, {
			matchId: 0, // First match of round 1
			scores: [16, 12],
			winnerSide: "opponent1",
		}).data;

		data = Engine.reportResult(data, {
			matchId: 1, // Second match of round 1
			scores: [13, 16],
			winnerSide: "opponent2",
		}).data;

		expect(matchById(data, 3).opponent1?.id).toBe(
			matchById(data, 0).opponent2?.id,
		);
		expect(matchById(data, 3).opponent2?.id).toBe(
			matchById(data, 1).opponent1?.id,
		);
		expect(Engine.matchStatus(data, 2)).toBe("STARTED");
		expect(Engine.matchStatus(data, 3)).toBe("STARTED");
	});

	test("should play both the final and consolation final in parallel", () => {
		let data = createResolved({
			type: "single_elimination",
			seeding: [1, 2, 3, 4],
			settings: { consolationFinal: true },
		});

		data = Engine.reportResult(data, {
			matchId: 0, // First match of round 1
			scores: [16, 12],
			winnerSide: "opponent1",
		}).data;

		data = Engine.reportResult(data, {
			matchId: 1, // Second match of round 1
			scores: [13, 16],
			winnerSide: "opponent2",
		}).data;

		data = Engine.reportResult(data, {
			matchId: 2, // Final
			scores: [12, 9],
		}).data;

		expect(Engine.matchStatus(data, 2)).toBe("STARTED");
		expect(Engine.matchStatus(data, 3)).toBe("STARTED");

		data = Engine.reportResult(data, {
			matchId: 3, // Consolation final
			scores: [12, 9],
		}).data;

		expect(Engine.matchStatus(data, 2)).toBe("STARTED");
		expect(Engine.matchStatus(data, 3)).toBe("STARTED");

		data = Engine.reportResult(data, {
			matchId: 3, // Consolation final
			scores: [16, 9],
			winnerSide: "opponent1",
		}).data;

		expect(Engine.matchStatus(data, 2)).toBe("STARTED");

		expect(() =>
			Engine.reportResult(data, {
				matchId: 2, // Final
				scores: [16, 9],
				winnerSide: "opponent1",
			}),
		).not.toThrow();
	});
});

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
