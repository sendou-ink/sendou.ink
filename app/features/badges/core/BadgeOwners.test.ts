import { describe, expect, test } from "vitest";
import * as BadgeOwners from "./BadgeOwners";

const WINNER_ID = 1;
const OTHER_ID = 2;

describe("BadgeOwners.toOwnerIds", () => {
	test("lists a user once per copy they own", () => {
		expect(
			BadgeOwners.toOwnerIds([
				{ id: WINNER_ID, count: 2 },
				{ id: OTHER_ID, count: 1 },
			]),
		).toEqual([WINNER_ID, WINNER_ID, OTHER_ID]);
	});

	test("leaves out a user with no copies left", () => {
		expect(BadgeOwners.toOwnerIds([{ id: WINNER_ID, count: 0 }])).toEqual([]);
	});
});

describe("BadgeOwners.total", () => {
	test("sums every owner's copies", () => {
		expect(
			BadgeOwners.total([
				{ id: WINNER_ID, count: 3 },
				{ id: OTHER_ID, count: 1 },
			]),
		).toBe(4);
	});
});

describe("BadgeOwners.changes", () => {
	const current = [
		{ id: WINNER_ID, count: 2 },
		{ id: OTHER_ID, count: 1 },
	];

	test("lists nothing when no count changed", () => {
		expect(
			BadgeOwners.changes(
				current.map((owner) => ({ ...owner, username: "user" })),
				current,
			),
		).toEqual([]);
	});

	test("adds every copy of a user new to the owners", () => {
		expect(
			BadgeOwners.changes([{ id: 3, count: 2, username: "New" }], current),
		).toEqual([{ id: 3, username: "New", type: "added", difference: 2 }]);
	});

	test("tells raised and lowered counts apart by how much they changed", () => {
		expect(
			BadgeOwners.changes(
				[
					{ id: WINNER_ID, count: 5, username: "Winner" },
					{ id: OTHER_ID, count: 0, username: "Other" },
				],
				current,
			),
		).toEqual([
			{ id: WINNER_ID, username: "Winner", type: "added", difference: 3 },
			{ id: OTHER_ID, username: "Other", type: "removed", difference: 1 },
		]);
	});
});

describe("BadgeOwners.reconcile", () => {
	const win = (tournamentId: number, userId = WINNER_ID) => ({
		userId,
		tournamentId,
	});

	test("counts a user's tournament wins first, the rest being a manual grant", () => {
		expect(
			BadgeOwners.reconcile({
				ownerIds: [WINNER_ID, WINNER_ID, WINNER_ID],
				tournamentWins: [win(10)],
			}),
		).toEqual({
			removedWins: [],
			manualGrants: [{ userId: WINNER_ID, count: 2 }],
		});
	});

	test("grants copies by hand to users without wins", () => {
		expect(
			BadgeOwners.reconcile({
				ownerIds: [WINNER_ID, OTHER_ID],
				tournamentWins: [win(10)],
			}),
		).toEqual({
			removedWins: [],
			manualGrants: [{ userId: OTHER_ID, count: 1 }],
		});
	});

	test("lowering a total below the wins removes the most recent ones", () => {
		expect(
			BadgeOwners.reconcile({
				ownerIds: [WINNER_ID],
				tournamentWins: [win(30), win(10), win(20)],
			}),
		).toEqual({
			removedWins: [win(20), win(30)],
			manualGrants: [],
		});
	});

	test("removes every win of a user dropped from the owners", () => {
		expect(
			BadgeOwners.reconcile({
				ownerIds: [OTHER_ID],
				tournamentWins: [win(10)],
			}),
		).toEqual({
			removedWins: [win(10)],
			manualGrants: [{ userId: OTHER_ID, count: 1 }],
		});
	});
});
