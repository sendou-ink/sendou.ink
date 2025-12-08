import { describe, expect, it } from "vitest";
import * as Deadline from "./Deadline";

describe("totalMatchTime", () => {
	it("calculates total time for best of 3", () => {
		expect(Deadline.totalMatchTime(3)).toBe(26);
	});

	it("calculates total time for best of 5", () => {
		expect(Deadline.totalMatchTime(5)).toBe(39);
	});
});

describe("progressPercentage", () => {
	it("returns 0% when no time has elapsed", () => {
		expect(Deadline.progressPercentage(0, 20)).toBe(0);
	});

	it("returns 50% when halfway through", () => {
		expect(Deadline.progressPercentage(10, 20)).toBe(50);
	});

	it("returns 100% when time is up", () => {
		expect(Deadline.progressPercentage(20, 20)).toBe(100);
	});

	it("returns over 100% when overtime", () => {
		expect(Deadline.progressPercentage(30, 20)).toBe(150);
	});
});

describe("gameMarkers", () => {
	it("returns correct markers for best of 3", () => {
		const markers = Deadline.gameMarkers(3);
		expect(markers).toHaveLength(3);
		expect(markers[0].gameNumber).toBe(1);
		expect(markers[0].percentage).toBe(25);
		expect(markers[0].gameStartMinute).toBe(6.5);
		expect(markers[1].percentage).toBe(50);
		expect(markers[1].gameStartMinute).toBe(13);
		expect(markers[2].percentage).toBe(75);
		expect(markers[2].gameStartMinute).toBe(19.5);
	});

	it("returns correct markers for best of 5", () => {
		const markers = Deadline.gameMarkers(5);
		expect(markers).toHaveLength(5);
		expect(markers[0].gameNumber).toBe(1);
		expect(markers[0].gameStartMinute).toBe(6.5);
		expect(markers[1].gameStartMinute).toBe(13);
		expect(markers[2].gameStartMinute).toBe(19.5);
		expect(markers[3].gameStartMinute).toBe(26);
		expect(markers[4].gameStartMinute).toBe(32.5);
	});
});

describe("matchStatus", () => {
	it("returns normal when on schedule", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 10,
			gamesCompleted: 1,
			maxGamesCount: 3,
		});
		expect(status).toBe("normal");
	});

	it("returns warning when behind schedule", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 15,
			gamesCompleted: 0,
			maxGamesCount: 3,
		});
		expect(status).toBe("warning");
	});

	it("returns error when time is up", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 30,
			gamesCompleted: 2,
			maxGamesCount: 3,
		});
		expect(status).toBe("error");
	});

	it("returns normal during prep time", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 5,
			gamesCompleted: 0,
			maxGamesCount: 3,
		});
		expect(status).toBe("normal");
	});

	it("defaults to normal for zero elapsed time", () => {
		const status = Deadline.matchStatus({
			elapsedMinutes: 0,
			gamesCompleted: 0,
			maxGamesCount: 3,
		});
		expect(status).toBe("normal");
	});
});
