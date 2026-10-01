import { beforeEach, describe, expect, test } from "vitest";
import { DEV_TEST_ID } from "~/db/seed/constants";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { type TestUser, wrappedLoader } from "~/utils/Test";
import { loader, type NewTrophyLoaderData } from "./trophies.new.server";

const newTrophyLoader = wrappedLoader<NewTrophyLoaderData>({ loader });

const users = UserFactory.pool();
const managerId = () => users.id(1);
const otherManagerId = () => users.id(2);

describe("managing trophies", () => {
	let managedTrophyId: number;
	let otherTrophyId: number;

	beforeEach(async () => {
		await UserFactory.createAdmin();
		await users.create(2);
		await UserFactory.createDev();

		managedTrophyId = (await TrophyFactory.create({ managerId: managerId() }))
			.id;
		otherTrophyId = (
			await TrophyFactory.create({ managerId: otherManagerId() })
		).id;
	});

	const trophyIds = async (
		user: TestUser,
		list: "editableTrophies" | "backfillTrophies",
	) =>
		(await newTrophyLoader({ user }))[list]
			.map((trophy) => trophy.id)
			.toSorted((a, b) => a - b);

	test("a manager can edit only the trophies they manage", async () => {
		expect(await trophyIds(managerId(), "editableTrophies")).toEqual([
			managedTrophyId,
		]);
	});

	test("a dev can edit every trophy", async () => {
		expect(await trophyIds(DEV_TEST_ID, "editableTrophies")).toEqual([
			managedTrophyId,
			otherTrophyId,
		]);
	});

	// the admin's override of per-object permissions only applies in production
	test("doesn't offer the admin trophies the server would refuse them", async () => {
		expect(await trophyIds("admin", "editableTrophies")).toEqual([]);
	});

	test.each([
		{ why: "an admin", user: "admin" as const },
		{ why: "a dev", user: DEV_TEST_ID },
	])("$why can backfill every trophy", async ({ user }) => {
		expect(await trophyIds(user, "backfillTrophies")).toEqual([
			managedTrophyId,
			otherTrophyId,
		]);
	});

	test("a manager can't backfill even their own trophy", async () => {
		expect(await trophyIds(managerId(), "backfillTrophies")).toEqual([]);
	});
});
