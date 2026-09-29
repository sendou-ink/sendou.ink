import { beforeEach, describe, expect, test } from "vitest";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import { loader, type NewTrophyLoaderData } from "./trophies.new.server";

const newTrophyLoader = wrappedLoader<NewTrophyLoaderData>({ loader });

const users = UserFactory.pool();
const managerId = () => users.id(1);
const otherManagerId = () => users.id(2);

describe("editable trophies", () => {
	let managedTrophyId: number;

	beforeEach(async () => {
		await UserFactory.createAdmin();
		await users.create(2);

		managedTrophyId = (await TrophyFactory.create({ managerId: managerId() }))
			.id;
		await TrophyFactory.create({ managerId: otherManagerId() });
	});

	const editableTrophyIds = async (user: "admin" | number) =>
		(await newTrophyLoader({ user })).editableTrophies.map(
			(trophy) => trophy.id,
		);

	test("lists only the trophies the user manages", async () => {
		expect(await editableTrophyIds(managerId())).toEqual([managedTrophyId]);
	});

	// the admin's override of per-object permissions only applies in production
	test("doesn't offer the admin trophies the server would refuse them", async () => {
		expect(await editableTrophyIds("admin")).toEqual([]);
	});
});
