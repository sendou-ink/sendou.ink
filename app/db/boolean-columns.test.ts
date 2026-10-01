import { beforeEach, describe, expect, test } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import {
	asBoolean,
	jsonArrayFrom,
	jsonBuildObject,
} from "~/utils/kysely.server";
import { db } from "./sql";

const users = UserFactory.pool();

describe("boolean columns", () => {
	beforeEach(async () => {
		await users.create(2);
		await ScrimPostFactory.create({
			users: [
				{ userId: users.id(1), isOwner: true },
				{ userId: users.id(2), isOwner: false },
			],
			managedByAnyone: true,
		});
	});

	test("read back as a boolean", async () => {
		const rows = await db
			.selectFrom("ScrimPostUser")
			.select("ScrimPostUser.isOwner")
			.orderBy("ScrimPostUser.userId", "asc")
			.execute();

		expect(rows.map((row) => row.isOwner)).toEqual([true, false]);
	});

	test("a boolean parameter compares as 0/1", async () => {
		const rows = await db
			.selectFrom("ScrimPostUser")
			.select("ScrimPostUser.userId")
			.where("ScrimPostUser.isOwner", "=", true)
			.execute();

		expect(rows.map((row) => row.userId)).toEqual([users.id(1)]);
	});

	test.each([
		{
			why: "jsonArrayFrom",
			select: () =>
				db
					.selectFrom("ScrimPost")
					.select((eb) =>
						jsonArrayFrom(
							eb
								.selectFrom("ScrimPostUser")
								.select("ScrimPostUser.isOwner")
								.orderBy("ScrimPostUser.userId", "asc"),
						).as("flags"),
					)
					.executeTakeFirstOrThrow()
					.then((row) => row.flags.map((flag) => flag.isOwner)),
		},
		{
			why: "jsonBuildObject",
			select: () =>
				db
					.selectFrom("ScrimPost")
					.select((eb) =>
						jsonBuildObject({
							managedByAnyone: eb.ref("ScrimPost.managedByAnyone"),
							isScheduledForFuture: eb.ref("ScrimPost.isScheduledForFuture"),
						}).as("flags"),
					)
					.executeTakeFirstOrThrow()
					.then((row) => [
						row.flags.managedByAnyone,
						row.flags.isScheduledForFuture,
					]),
		},
	])("nested in JSON as JSON booleans ($why)", async ({ select }) => {
		expect(await select()).toEqual([true, false]);
	});

	test("asBoolean reads a computed flag as a boolean", async () => {
		const row = await db
			.selectFrom("ScrimPost")
			.select((eb) => [
				asBoolean(
					eb.exists(
						eb
							.selectFrom("ScrimPostUser")
							.select("ScrimPostUser.userId")
							.whereRef("ScrimPostUser.scrimPostId", "=", "ScrimPost.id"),
					),
				).as("hasUsers"),
				jsonBuildObject({
					hasRequests: asBoolean(
						eb.exists(
							eb
								.selectFrom("ScrimPostRequest")
								.select("ScrimPostRequest.id")
								.whereRef("ScrimPostRequest.scrimPostId", "=", "ScrimPost.id"),
						),
					),
				}).as("nested"),
			])
			.executeTakeFirstOrThrow();

		expect(row.hasUsers).toBe(true);
		expect(row.nested.hasRequests).toBe(false);
	});
});
