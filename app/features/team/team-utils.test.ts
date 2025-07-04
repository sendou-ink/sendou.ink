import { describe, expect, it } from "vitest";
import { subsOfResult } from "./team-utils";

describe("subsOfResult()", () => {
	it("returns empty array if all participants are current members", () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }],
			startTime: 1000,
		};
		const members = [
			{ userId: 1, createdAt: 500, leftAt: null },
			{ userId: 2, createdAt: 600, leftAt: null },
		];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([]);
	});

	it("returns participant not in members as sub", () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }],
			startTime: 1000,
		};
		const members = [{ userId: 1, createdAt: 500, leftAt: null }];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([{ id: 2 }]);
	});

	it("returns participant as sub if they left before result startTime", () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }],
			startTime: 1000,
		};
		const members = [
			{ userId: 1, createdAt: 500, leftAt: 900 },
			{ userId: 2, createdAt: 600, leftAt: null },
		];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([{ id: 1 }]);
	});

	it("does not return participant as sub if they were a member during result", () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }],
			startTime: 1000,
		};
		const members = [
			{ userId: 1, createdAt: 500, leftAt: 2000 },
			{ userId: 2, createdAt: 600, leftAt: null },
		];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([]);
	});

	it("returns multiple subs correctly", () => {
		const result = {
			participants: [{ id: 1 }, { id: 2 }, { id: 3 }],
			startTime: 1000,
		};
		const members = [
			{ userId: 1, createdAt: 500, leftAt: 900 },
			{ userId: 2, createdAt: 600, leftAt: null },
		];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([{ id: 1 }, { id: 3 }]);
	});

	it("returns empty array if no participants", () => {
		const result = {
			participants: [],
			startTime: 1000,
		};
		const members = [{ userId: 1, createdAt: 500, leftAt: null }];
		const subs = subsOfResult(result, members);
		expect(subs).toEqual([]);
	});
});
