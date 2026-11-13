import { addDays, subDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Bans from "./Bans.server";

const users = UserFactory.pool();
const staffId = () => users.id(1);
const userId = () => users.id(2);

const banUntil = (banned: 1 | Date) =>
	UserFactory.grant(userId(), {
		ban: { banned, bannedReason: null, bannedByUserId: staffId() },
	});

describe("Bans.isBanned", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("is false for a user who was never banned", async () => {
		await Bans.refresh();

		expect(Bans.isBanned(userId())).toBe(false);
	});

	test("is true for a ban without an end", async () => {
		await banUntil(1);
		await Bans.refresh();

		expect(Bans.isBanned(userId())).toBe(true);
	});

	test("is true for a timed ban still running", async () => {
		await banUntil(addDays(new Date(), 1));
		await Bans.refresh();

		expect(Bans.isBanned(userId())).toBe(true);
	});

	test("is false once a timed ban has lifted", async () => {
		await banUntil(subDays(new Date(), 1));
		await Bans.refresh();

		expect(Bans.isBanned(userId())).toBe(false);
	});
});

describe("Bans.refresh", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("picks up a ban made since the last refresh", async () => {
		await Bans.refresh();
		await banUntil(1);

		expect(Bans.isBanned(userId())).toBe(false);

		await Bans.refresh();

		expect(Bans.isBanned(userId())).toBe(true);
	});
});
