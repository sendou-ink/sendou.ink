import { beforeEach, describe, expect, expectTypeOf, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { crud } from "./crud";

const users = UserFactory.pool();
const authorId = () => users.id(1);
const targetId = () => users.id(2);

const modNotes = crud("ModNote");
const privateNotes = crud("PrivateUserNote");

describe("crud", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("insert returns the id of a table with an id primary key", async () => {
		const { id } = await modNotes.insert({
			userId: targetId(),
			authorId: authorId(),
			text: "note",
		});

		expect(await modNotes.findById(id)).toMatchObject({
			id,
			text: "note",
			isDeleted: 0,
		});
	});

	test("updateById and deleteById report whether the row existed", async () => {
		const { id } = await modNotes.insert({
			userId: targetId(),
			authorId: authorId(),
			text: "note",
		});

		expect(await modNotes.updateById(id, { text: "edited" })).toBe(true);
		expect((await modNotes.findById(id))?.text).toBe("edited");

		expect(await modNotes.deleteById(id)).toBe(true);
		expect(await modNotes.deleteById(id)).toBe(false);
		expect(await modNotes.findById(id)).toBeUndefined();
	});

	test("upsert updates only the listed columns of the row it conflicts with", async () => {
		const key = { authorId: authorId(), targetId: targetId() };
		await privateNotes.insert({ ...key, text: "first", sentiment: "NEUTRAL" });

		await privateNotes.upsert(
			{ ...key, text: "second", sentiment: "POSITIVE" },
			{ conflict: ["authorId", "targetId"], update: ["text"] },
		);

		expect(await privateNotes.findOneBy(key)).toMatchObject({
			text: "second",
			sentiment: "NEUTRAL",
		});
		expect(await privateNotes.count(key)).toBe(1);
	});

	test("updates stamp updatedAt, an update with no values included", async () => {
		const key = { authorId: authorId(), targetId: targetId() };
		await privateNotes.insert({ ...key, sentiment: "NEUTRAL", updatedAt: 1 });

		await privateNotes.update(key, {});

		expect((await privateNotes.findOneBy(key))?.updatedAt).toBeGreaterThan(1);
	});

	test("upsert stamps updatedAt on the row it conflicts with", async () => {
		const key = { authorId: authorId(), targetId: targetId() };
		await privateNotes.insert({ ...key, sentiment: "NEUTRAL", updatedAt: 1 });

		await privateNotes.upsert(
			{ ...key, text: "second", sentiment: "NEUTRAL" },
			{ conflict: ["authorId", "targetId"], update: ["text"] },
		);

		expect((await privateNotes.findOneBy(key))?.updatedAt).toBeGreaterThan(1);
	});

	test("findManyBy treats null as is null and applies limit and orderBy", async () => {
		await privateNotes.insertMany([
			{ authorId: authorId(), targetId: targetId(), sentiment: "NEUTRAL" },
			{ authorId: targetId(), targetId: authorId(), sentiment: "NEUTRAL" },
		]);

		const rows = await privateNotes.findManyBy(
			{ text: null },
			{ limit: 1, orderBy: [["authorId", "desc"]] },
		);

		expect(rows.map((row) => row.authorId)).toEqual([targetId()]);
	});

	test("exists matches every column of the filter", async () => {
		await privateNotes.insert({
			authorId: authorId(),
			targetId: targetId(),
			sentiment: "NEUTRAL",
		});

		expect(
			await privateNotes.exists({ authorId: authorId(), sentiment: "NEUTRAL" }),
		).toBe(true);
		expect(
			await privateNotes.exists({
				authorId: authorId(),
				sentiment: "POSITIVE",
			}),
		).toBe(false);
	});

	test("update and delete throw without a filter", async () => {
		await expect(
			privateNotes.delete({ authorId: undefined } as never),
		).rejects.toThrow("without a where filter");
	});

	test("ops follow the table's keys", () => {
		expectTypeOf(modNotes).toHaveProperty("findById");
		expectTypeOf(privateNotes).not.toHaveProperty("findById");
		expectTypeOf(privateNotes).toHaveProperty("upsert");
		expectTypeOf(crud("UserFriendCode")).not.toHaveProperty("findOneBy");
		expectTypeOf(crud("Team")).not.toHaveProperty("insert");
		expectTypeOf(crud("Team")).toHaveProperty("findManyBy");

		expectTypeOf(privateNotes.update)
			.parameter(1)
			.not.toHaveProperty("updatedAt");

		const userTable = crud("User");
		expectTypeOf(userTable.findOneBy).toBeCallableWith({ customUrl: "sendou" });
		expectTypeOf(userTable.findOneBy).toBeCallableWith({ id: 1 });
		// @ts-expect-error not a unique key
		expectTypeOf(userTable.findOneBy).toBeCallableWith({ username: "Sendou" });
	});
});
