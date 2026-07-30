import { describe, expect, test } from "vitest";
import { createResolved } from "../create";
import * as Engine from "../index";
import type { BracketData } from "../types";

describe("Previous and next match update in double elimination stage", () => {
	test("should end a match and determine next matches", () => {
		let data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});

		const before = matchById(data, 8); // First match of WB round 2
		expect(before.opponent2?.id).toBeNull();

		data = Engine.reportResult(data, {
			matchId: 0, // First match of WB round 1
			scores: [16, 12],
			winnerSide: "opponent1",
		}).data;

		data = Engine.reportResult(data, {
			matchId: 1, // Second match of WB round 1
			scores: [13, 16],
			winnerSide: "opponent2",
		}).data;

		data = Engine.reportResult(data, {
			matchId: 15, // First match of LB round 1
			scores: [16, 10],
			winnerSide: "opponent1",
		}).data;

		expect(
			matchById(data, 8).opponent1?.id, // Determined opponent for WB round 2
		).toBe(matchById(data, 0).opponent1?.id); // Winner of first match round 1

		expect(
			matchById(data, 8).opponent2?.id, // Determined opponent for WB round 2
		).toBe(matchById(data, 1).opponent2?.id); // Winner of second match round 1

		expect(
			matchById(data, 15).opponent2?.id, // Determined opponent for LB round 1
		).toBe(matchById(data, 1).opponent1?.id); // Loser of second match round 1

		expect(
			matchById(data, 19).opponent2?.id, // Determined opponent for LB round 2
		).toBe(matchById(data, 0).opponent2?.id); // Loser of first match round 1
	});

	test("should propagate winner when BYE is already in next match in loser bracket", () => {
		let data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, null],
			settings: {},
		});

		data = Engine.reportResult(data, {
			matchId: 1, // Second match of WB round 1
			scores: [16, 12],
			winnerSide: "opponent1",
		}).data;

		const loserId = matchById(data, 1).opponent2?.id;

		expect(matchById(data, 3).opponent2?.id).toBe(loserId);
		expect(matchById(data, 3).winnerSide).toBe("opponent2");
		expect(Engine.matchStatus(data, 3)).toBe("COMPLETED");

		expect(
			matchById(data, 4).opponent2?.id, // Propagated winner in LB Final because of the BYE.
		).toBe(loserId);

		data = Engine.resetMatchResults(data, 1).data; // Second match of WB round 1

		expect(matchById(data, 3).opponent2?.id).toBeNull();
		expect(matchById(data, 3).winnerSide).toBeNull();
		expect(Engine.matchStatus(data, 3)).toBe("PENDING");

		expect(matchById(data, 4).opponent2?.id).toBeNull(); // Propagated winner is removed.
	});

	test("should determine matches in grand final", () => {
		let data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		data = Engine.reportResult(data, {
			matchId: 0, // First match of WB round 1
			scores: [16, 12],
			winnerSide: "opponent1",
		}).data;

		data = Engine.reportResult(data, {
			matchId: 1, // Second match of WB round 1
			scores: [13, 16],
			winnerSide: "opponent2",
		}).data;

		data = Engine.reportResult(data, {
			matchId: 2, // WB Final
			scores: [16, 9],
			winnerSide: "opponent1",
		}).data;

		expect(
			matchById(data, 5).opponent1?.id, // Determined opponent for the grand final (round 1)
		).toBe(matchById(data, 0).opponent1?.id); // Winner of WB Final

		data = Engine.reportResult(data, {
			matchId: 3, // Only match of LB round 1
			scores: [12, 8],
			winnerSide: "opponent1", // Team 4
		}).data;

		data = Engine.reportResult(data, {
			matchId: 4, // LB Final
			scores: [14, 7],
			winnerSide: "opponent1", // Team 3
		}).data;

		expect(
			matchById(data, 5).opponent2?.id, // Determined opponent for the grand final (round 1)
		).toBe(matchById(data, 1).opponent2?.id); // Winner of LB Final

		data = Engine.reportResult(data, {
			matchId: 5, // Grand Final round 1
			scores: [10, 16],
			winnerSide: "opponent2", // Team 3
		}).data;

		expect(
			matchById(data, 6).opponent2?.id, // Determined opponent for the grand final (round 2)
		).toBe(matchById(data, 1).opponent2?.id); // Winner of LB Final

		expect(Engine.matchStatus(data, 5)).toBe("COMPLETED"); // Grand final (round 1)
		expect(Engine.matchStatus(data, 6)).toBe("STARTED"); // Grand final (round 2)

		expect(() =>
			Engine.reportResult(data, {
				matchId: 6, // Grand Final round 2
				scores: [16, 10],
				winnerSide: "opponent1",
			}),
		).not.toThrow();
	});

	test("should determine next matches and reset them", () => {
		let data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4],
			settings: {},
		});

		data = Engine.reportResult(data, {
			matchId: 0, // First match of WB round 1
			scores: [16, 12],
			winnerSide: "opponent1",
		}).data;

		const beforeReset = matchById(data, 3); // Determined opponent for LB round 1
		expect(beforeReset.opponent1?.id).toBe(matchById(data, 0).opponent2?.id);
		expect(beforeReset.opponent1?.position).toBe(1); // Must be set.

		data = Engine.resetMatchResults(data, 0).data; // First match of WB round 1

		const afterReset = matchById(data, 3); // Determined opponent for LB round 1
		expect(afterReset.opponent1?.id).toBeNull();
		expect(afterReset.opponent1?.position).toBe(1); // It must stay.
	});

	test("should choose the correct previous and next matches based on losers ordering", () => {
		let data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
			settings: {},
		});

		data = Engine.reportResult(data, {
			matchId: 0,
			winnerSide: "opponent1",
		}).data; // WB 1.1
		expect(
			matchById(data, 15).opponent1?.id, // Determined opponent for first match of LB round 1 (natural ordering for losers)
		).toBe(matchById(data, 0).opponent2?.id); // Loser of first match round 1

		data = Engine.reportResult(data, {
			matchId: 1,
			winnerSide: "opponent1",
		}).data; // WB 1.2
		expect(
			matchById(data, 15).opponent2?.id, // Determined opponent for first match of LB round 1 (natural ordering for losers)
		).toBe(matchById(data, 1).opponent2?.id); // Loser of second match round 1

		data = Engine.reportResult(data, {
			matchId: 8,
			winnerSide: "opponent1",
		}).data; // WB 2.1
		expect(
			matchById(data, 20).opponent1?.id, // Determined opponent for first match of LB round 2
		).toBe(matchById(data, 8).opponent2?.id); // Loser of first match round 2

		for (const matchId of [
			6, // WB 1.7
			7, // WB 1.8
			11, // WB 2.4
			15, // LB 1.1
			18, // LB 1.4
		]) {
			data = Engine.reportResult(data, {
				matchId,
				winnerSide: "opponent1",
			}).data;
		}

		expect(Engine.matchStatus(data, 8)).toBe("COMPLETED"); // WB 2.1
	});

	test("should send the losers to the right LB matches in round 1", () => {
		let data = createResolved({
			type: "double_elimination",
			seeding: [1, 2, 3, 4, 5, 6, 7, 8],
			settings: {},
		});

		expect(matchById(data, 7).opponent1?.position).toBe(1);
		expect(matchById(data, 7).opponent2?.position).toBe(2);
		expect(matchById(data, 8).opponent1?.position).toBe(3);
		expect(matchById(data, 8).opponent2?.position).toBe(4);

		// Match of position 1.
		data = Engine.reportResult(data, {
			matchId: 0,
			winnerSide: "opponent1", // Loser id: 8.
		}).data;

		expect(matchById(data, 7).opponent1?.id).toBe(8);

		// Match of position 2.
		data = Engine.reportResult(data, {
			matchId: 1,
			winnerSide: "opponent1", // Loser id: 5.
		}).data;

		expect(matchById(data, 7).opponent2?.id).toBe(5);

		// Match of position 3.
		data = Engine.reportResult(data, {
			matchId: 2,
			winnerSide: "opponent1", // Loser id: 7.
		}).data;

		expect(matchById(data, 8).opponent1?.id).toBe(7);

		// Match of position 4.
		data = Engine.reportResult(data, {
			matchId: 3,
			winnerSide: "opponent1", // Loser id: 6.
		}).data;

		expect(matchById(data, 8).opponent2?.id).toBe(6);
	});
});

function matchById(data: BracketData, id: number) {
	const found = data.match.find((match) => match.id === id);
	if (!found) throw new Error(`Match ${id} not found`);

	return found;
}
