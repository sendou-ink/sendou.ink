import { describe, expect, test } from "vitest";
import { ASSOCIATION } from "../associations-constants";
import * as Association from "./Association";

describe("Association.maxMembershipCount", () => {
	test.each([
		{
			why: "regular user",
			isSupporter: false,
			expected: ASSOCIATION.MAX_COUNT_REGULAR_USER,
		},
		{
			why: "supporter",
			isSupporter: true,
			expected: ASSOCIATION.MAX_COUNT_SUPPORTER,
		},
	])("$why", ({ isSupporter, expected }) => {
		expect(Association.maxMembershipCount({ isSupporter })).toBe(expected);
	});
});

describe("Association.virtualIdentifiersOf", () => {
	test.each([
		{ why: "not in the Plus Server", plusTier: null, expected: ["FRIENDS"] },
		{ why: "+1", plusTier: 1, expected: ["FRIENDS", "+1", "+2", "+3"] },
		{ why: "+2", plusTier: 2, expected: ["FRIENDS", "+2", "+3"] },
		{ why: "+3", plusTier: 3, expected: ["FRIENDS", "+3"] },
	])("$why", ({ plusTier, expected }) => {
		expect(Association.virtualIdentifiersOf(plusTier)).toEqual(expected);
	});
});

describe("Association.resolveNewAdmin", () => {
	test("picks the starred member with the lowest user id", () => {
		const newAdmin = Association.resolveNewAdmin([
			{ id: 1, role: "ADMIN" },
			{ id: 5, role: "MANAGER" },
			{ id: 2, role: "MEMBER" },
			{ id: 3, role: "MANAGER" },
		]);

		expect(newAdmin?.id).toBe(3);
	});

	test("returns null when there is no starred member", () => {
		expect(
			Association.resolveNewAdmin([
				{ id: 1, role: "ADMIN" },
				{ id: 2, role: "MEMBER" },
			]),
		).toBeNull();
	});
});
