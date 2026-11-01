import { describe, expect, test } from "vitest";
import * as Deadline from "./Deadline";

describe("totalMatchTime", () => {
	test("calculates total time for best of 3", () => {
		expect(Deadline.totalMatchTime(3)).toBe(26);
	});

	test("calculates total time for best of 5", () => {
		expect(Deadline.totalMatchTime(5)).toBe(39);
	});
});

describe("matchStatus", () => {
	test("returns normal when on schedule", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 10,
			gamesCompleted: 1,
			maxGamesCount: 3,
		});
		expect(status).toBe("normal");
	});

	test("returns warning when behind schedule", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 15,
			gamesCompleted: 0,
			maxGamesCount: 3,
		});
		expect(status).toBe("warning");
	});

	test("returns error when time is up", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 30,
			gamesCompleted: 2,
			maxGamesCount: 3,
		});
		expect(status).toBe("error");
	});

	test("returns normal during prep time", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 5,
			gamesCompleted: 0,
			maxGamesCount: 3,
		});
		expect(status).toBe("normal");
	});

	test("defaults to normal for zero elapsed time", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 0,
			gamesCompleted: 0,
			maxGamesCount: 3,
		});
		expect(status).toBe("normal");
	});
});
