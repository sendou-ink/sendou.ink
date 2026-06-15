import { describe, expect, it, test } from "vitest";
import type { CommonUser } from "~/utils/kysely.server";
import { inferSubstitutions, resolveRoomPass } from "./utils";

function user(id: number): CommonUser {
	return {
		id,
		username: `user${id}`,
		discordId: `discord${id}`,
		discordAvatar: null,
		customUrl: null,
		customAvatarUrl: null,
	};
}

describe("inferSubstitutions", () => {
	it("returns an empty array when rosters are unchanged", () => {
		const rosters = {
			alpha: [user(1), user(2), user(3), user(4)],
			bravo: [user(5), user(6), user(7), user(8)],
		};

		expect(inferSubstitutions(rosters, rosters)).toEqual([]);
	});

	it("detects a single substitution on alpha", () => {
		const previous = {
			alpha: [user(1), user(2), user(3), user(4)],
			bravo: [user(5), user(6), user(7), user(8)],
		};
		const current = {
			alpha: [user(1), user(2), user(3), user(9)],
			bravo: previous.bravo,
		};

		expect(inferSubstitutions(previous, current)).toEqual([
			{ side: "ALPHA", playerOut: user(4), playerIn: user(9) },
		]);
	});

	it("detects substitutions on both sides in the same map transition", () => {
		const previous = {
			alpha: [user(1), user(2)],
			bravo: [user(3), user(4)],
		};
		const current = {
			alpha: [user(1), user(10)],
			bravo: [user(11), user(4)],
		};

		expect(inferSubstitutions(previous, current)).toEqual([
			{ side: "ALPHA", playerOut: user(2), playerIn: user(10) },
			{ side: "BRAVO", playerOut: user(3), playerIn: user(11) },
		]);
	});

	it("pairs multiple substitutions on the same side by roster order", () => {
		const previous = {
			alpha: [user(1), user(2), user(3), user(4)],
			bravo: [user(5), user(6)],
		};
		const current = {
			alpha: [user(1), user(10), user(3), user(11)],
			bravo: previous.bravo,
		};

		expect(inferSubstitutions(previous, current)).toEqual([
			{ side: "ALPHA", playerOut: user(2), playerIn: user(10) },
			{ side: "ALPHA", playerOut: user(4), playerIn: user(11) },
		]);
	});

	it("ignores unpaired leavers when no new player joined", () => {
		const previous = {
			alpha: [user(1), user(2), user(3), user(4)],
			bravo: [user(5), user(6)],
		};
		const current = {
			alpha: [user(1), user(2), user(3)],
			bravo: previous.bravo,
		};

		expect(inferSubstitutions(previous, current)).toEqual([]);
	});

	it("ignores unpaired joiners when no player left", () => {
		const previous = {
			alpha: [user(1), user(2), user(3)],
			bravo: [user(5), user(6)],
		};
		const current = {
			alpha: [user(1), user(2), user(3), user(9)],
			bravo: previous.bravo,
		};

		expect(inferSubstitutions(previous, current)).toEqual([]);
	});

	it("treats players switching sides as separate substitutions on each side", () => {
		const previous = {
			alpha: [user(1), user(2)],
			bravo: [user(3), user(4)],
		};
		const current = {
			alpha: [user(3), user(4)],
			bravo: [user(1), user(2)],
		};

		expect(inferSubstitutions(previous, current)).toEqual([
			{ side: "ALPHA", playerOut: user(1), playerIn: user(3) },
			{ side: "ALPHA", playerOut: user(2), playerIn: user(4) },
			{ side: "BRAVO", playerOut: user(3), playerIn: user(1) },
			{ side: "BRAVO", playerOut: user(4), playerIn: user(2) },
		]);
	});
});

describe("resolveRoomPass", () => {
	test("returns a 4-digit password", () => {
		const pass = resolveRoomPass(12345);

		expect(pass).toMatch(/^\d{4}$/);
	});

	test("returns deterministic password for a given numeric seed", () => {
		const pass1 = resolveRoomPass(12345);
		const pass2 = resolveRoomPass(12345);
		expect(pass1).toBe(pass2);
	});

	test("returns deterministic password for a given string seed", () => {
		const pass1 = resolveRoomPass("test-seed");
		const pass2 = resolveRoomPass("test-seed");
		expect(pass1).toBe(pass2);
	});

	test("returns different passwords for different seeds", () => {
		const pass1 = resolveRoomPass(1);
		const pass2 = resolveRoomPass(2);
		expect(pass1).not.toBe(pass2);
	});
});
