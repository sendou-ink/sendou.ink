import { beforeEach, describe, expect, expectTypeOf, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { crud } from "./crud";
import { isDatabaseDirty, markDatabaseClean } from "./write-tracker";

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

	test("upsert with no update columns leaves the conflicting row as is and returns its id", async () => {
		const players = crud("SplatoonPlayer");
		const existing = await players.insert({
			splId: "existing",
			userId: authorId(),
		});

		const upserted = await players.upsert(
			{ splId: "existing", userId: null },
			{ conflict: ["splId"], update: [] },
		);
		const inserted = await players.upsert(
			{ splId: "new" },
			{ conflict: ["splId"], update: [] },
		);

		expect(upserted).toEqual(existing);
		expect(await players.findById(existing.id)).toMatchObject({
			userId: authorId(),
		});
		expect(await players.findById(inserted.id)).toMatchObject({ splId: "new" });
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

	test("a reused compiled query binds each call's values", async () => {
		const first = await modNotes.insert({
			userId: targetId(),
			authorId: authorId(),
			text: "one",
		});
		const second = await modNotes.insert({
			userId: authorId(),
			authorId: targetId(),
			text: "two",
		});

		expect((await modNotes.findById(first.id))?.text).toBe("one");
		expect((await modNotes.findById(second.id))?.text).toBe("two");

		expect(
			await modNotes.update({ authorId: targetId() }, { text: "edited" }),
		).toBe(1);
		expect((await modNotes.findById(first.id))?.text).toBe("one");
		expect((await modNotes.findById(second.id))?.text).toBe("edited");
	});

	test("filters on null and on a value compile to separate queries", async () => {
		const note = { authorId: authorId(), targetId: targetId() };
		await privateNotes.insert({ ...note, text: null, sentiment: "NEUTRAL" });

		expect(await privateNotes.count({ ...note, text: null })).toBe(1);
		expect(await privateNotes.count({ ...note, text: "x" })).toBe(0);
		expect(await privateNotes.count({ ...note, text: null })).toBe(1);
	});

	test("a write through a reused compiled query marks the database dirty", async () => {
		const { id } = await modNotes.insert({
			userId: targetId(),
			authorId: authorId(),
			text: "note",
		});
		await modNotes.updateById(id, { text: "first" });

		markDatabaseClean();
		await modNotes.updateById(id, { text: "second" });

		expect(isDatabaseDirty()).toBe(true);
	});

	test("update and delete throw without a filter", async () => {
		await expect(
			privateNotes.delete({ authorId: undefined } as never),
		).rejects.toThrow("without a where filter");
	});

	test("except throws on an update setting an excepted column", async () => {
		const { id } = await modNotes.insert({
			userId: targetId(),
			authorId: authorId(),
			text: "note",
		});
		const values = { text: "edited", isDeleted: 1 } as const;

		await expect(
			modNotes.except("isDeleted").updateById(id, values),
		).rejects.toThrow("excepts isDeleted");
		expect((await modNotes.findById(id))?.text).toBe("note");
	});

	test("ops follow the table's keys", () => {
		expectTypeOf(modNotes).toHaveProperty("findById");
		expectTypeOf(privateNotes).not.toHaveProperty("findById");
		expectTypeOf(privateNotes).toHaveProperty("upsert");
		expectTypeOf(crud("UserFriendCode")).not.toHaveProperty("findOneBy");
		expectTypeOf(crud("TeamMember")).not.toHaveProperty("insert");
		expectTypeOf(crud("TeamMember")).toHaveProperty("findManyBy");

		expectTypeOf(privateNotes.update)
			.parameter(1)
			.not.toHaveProperty("updatedAt");

		const exceptingNotes = modNotes.except("isDeleted");
		expectTypeOf(exceptingNotes.updateById)
			.parameter(1)
			.not.toHaveProperty("isDeleted");
		expectTypeOf(exceptingNotes.updateById).parameter(1).toHaveProperty("text");
		expectTypeOf(exceptingNotes).not.toHaveProperty("insert");
		expectTypeOf(exceptingNotes.updateById).toBeCallableWith(1, {
			// @ts-expect-error an excepted column
			isDeleted: 1,
		});

		const userTable = crud("User");
		expectTypeOf(userTable.findOneBy).toBeCallableWith({ customUrl: "sendou" });
		expectTypeOf(userTable.findOneBy).toBeCallableWith({ id: 1 });
		// @ts-expect-error not a unique key
		expectTypeOf(userTable.findOneBy).toBeCallableWith({ username: "Sendou" });
	});
});
