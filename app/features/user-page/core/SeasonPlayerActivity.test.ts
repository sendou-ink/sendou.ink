import { addDays, addWeeks, startOfWeek } from "date-fns";
import { describe, expect, test } from "vitest";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as SeasonPlayerActivity from "./SeasonPlayerActivity";

const FIRST_WEEK = startOfWeek(new Date(2026, 5, 3), { weekStartsOn: 1 });

const playedAt = ({ week, day = 2 }: { week: number; day?: number }) =>
	dateToDatabaseTimestamp(addDays(addWeeks(FIRST_WEEK, week), day));

describe("SeasonPlayerActivity.summarize", () => {
	test("spans the weeks from the first set to the last, including the empty ones", () => {
		const { weeks } = SeasonPlayerActivity.summarize([
			{ otherUserId: 1, type: "MATE", playedAt: playedAt({ week: 0 }) },
			{ otherUserId: 2, type: "ENEMY", playedAt: playedAt({ week: 2 }) },
		]);

		expect(weeks).toEqual(
			[0, 1, 2].map((week) => addWeeks(FIRST_WEEK, week).getTime()),
		);
	});

	test("returns no weeks when there are no sets", () => {
		expect(SeasonPlayerActivity.summarize([]).weeks).toEqual([]);
	});

	test("counts sets per week of each player, weeks ascending", () => {
		const { players } = SeasonPlayerActivity.summarize([
			{ otherUserId: 1, type: "MATE", playedAt: playedAt({ week: 2 }) },
			{ otherUserId: 1, type: "MATE", playedAt: playedAt({ week: 0 }) },
			{ otherUserId: 1, type: "MATE", playedAt: playedAt({ week: 2, day: 5 }) },
		]);

		expect(players.MATE.get(1)).toEqual([
			[0, 1],
			[2, 2],
		]);
	});

	test("keeps the same player as a mate and as an enemy apart", () => {
		const { players } = SeasonPlayerActivity.summarize([
			{ otherUserId: 1, type: "MATE", playedAt: playedAt({ week: 0 }) },
			{ otherUserId: 1, type: "ENEMY", playedAt: playedAt({ week: 1 }) },
		]);

		expect(players.MATE.get(1)).toEqual([[0, 1]]);
		expect(players.ENEMY.get(1)).toEqual([[1, 1]]);
	});
});

describe("SeasonPlayerActivity.weeklyPoints", () => {
	test("fills the weeks without sets with zero", () => {
		const weeks = [0, 1, 2].map((week) => addWeeks(FIRST_WEEK, week).getTime());

		expect(
			SeasonPlayerActivity.weeklyPoints({ weeks, setsPerWeek: [[1, 3]] }),
		).toEqual([
			{ x: weeks[0], y: 0 },
			{ x: weeks[1], y: 3 },
			{ x: weeks[2], y: 0 },
		]);
	});
});
