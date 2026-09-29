import { beforeEach, describe, expect, expectTypeOf, test } from "vitest";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { defineQuery, mapRows, refine, sortedBy } from "./entity-query";

const users = UserFactory.pool();

const testBuilds = defineQuery({
	root: "Build",
	select: (qb) =>
		qb.select(["Build.id", "Build.title", "Build.ownerId", "Build.isPrivate"]),
	map: (row) => ({ title: row.title.toUpperCase() }),
	defaultSort: [["Build.id", "asc"]],
	guards: {
		private: (qb) => qb.where("Build.isPrivate", "=", 0),
	},
	vocabulary: ({ lift }) => ({
		includingPrivate: () => lift("private"),
		onlyPrivate: () =>
			lift("private", (qb) => qb.where("Build.isPrivate", "=", 1)),
		titleDesc: () => sortedBy("Build", ["Build.title", "desc"]),
		ownerDesc: () => sortedBy("Build", ["Build.ownerId", "desc"]),
		withTitleLength: () =>
			mapRows("Build", (row: { title: string }) => ({
				titleLength: row.title.length,
			})),
		withShoutedTitle: () =>
			mapRows("Build", (row: { title: string }) => ({
				title: `${row.title}!`,
			})),
		withExtraTitle: () =>
			mapRows("Build", (row: { title: string }) => ({ title: row.title })),
		withScore: () =>
			mapRows("Build", (row: { titleLength: number }) => ({
				score: row.titleLength * 2,
			})),
		sortedInsideRefine: () =>
			refine("Build", (qb) => qb.orderBy("Build.title", "asc")),
	}),
});

describe("defineQuery", () => {
	beforeEach(async () => {
		await users.create(2);
		await BuildFactory.create({ ownerId: users.id(1), title: "b" });
		await BuildFactory.create({ ownerId: users.id(2), title: "a" });
		await BuildFactory.create({
			ownerId: users.id(2),
			title: "c",
			isPrivate: 1,
		});
	});

	const titlesOf = (rows: Array<{ title: string }>) =>
		rows.map((row) => row.title);

	test("applies guards unless a step lifts them", async () => {
		expect(titlesOf(await testBuilds().execute())).toEqual(["B", "A"]);
		expect(titlesOf(await testBuilds().includingPrivate().execute())).toEqual([
			"B",
			"A",
			"C",
		]);
		expect(titlesOf(await testBuilds().onlyPrivate().execute())).toEqual(["C"]);
	});

	test("stacks sorts in call order and falls back to the default sort", async () => {
		expect(
			titlesOf(await testBuilds().ownerDesc().titleDesc().execute()),
		).toEqual(["A", "B"]);
		expect(
			titlesOf(
				await testBuilds().includingPrivate().ownerDesc().titleDesc().execute(),
			),
		).toEqual(["C", "A", "B"]);
	});

	test("filters by root column equality", async () => {
		const rows = await testBuilds()
			.includingPrivate()
			.where({ ownerId: users.id(2), isPrivate: 1 })
			.execute();

		expect(titlesOf(rows)).toEqual(["C"]);
	});

	test("applies limit after sorting", async () => {
		const rows = await testBuilds().titleDesc().limit(1).execute();

		expect(titlesOf(rows)).toEqual(["B"]);
		expect((await testBuilds().titleDesc().executeTakeFirst())?.title).toBe(
			"B",
		);
	});

	test("runs step mappers after the base map, in call order", async () => {
		const [row] = await testBuilds()
			.withShoutedTitle()
			.withTitleLength()
			.withScore()
			.execute();

		expect(row).toMatchObject({ title: "B!", titleLength: 2, score: 4 });
	});

	test("throws when a refine step sorts with orderBy", () => {
		expect(() => testBuilds().sortedInsideRefine().compile()).toThrow(
			"sortedBy",
		);
	});

	test("a one-off step can be added with .with()", async () => {
		const rows = await testBuilds()
			.with(refine("Build", (qb) => qb.where("Build.title", "=", "a")))
			.execute();

		expect(titlesOf(rows)).toEqual(["A"]);
	});

	test("withUser adds the user the foreign key points at", async () => {
		const [row] = await testBuilds()
			.with(UserRepository.withUser("owner", "Build.ownerId", ["plusTier"]))
			.execute();

		expect(row.owner).toMatchObject({ id: users.id(1), plusTier: null });
	});

	test("chain typing", () => {
		expectTypeOf(testBuilds().execute).returns.resolves.items.toEqualTypeOf<{
			id: number;
			title: string;
			ownerId: number;
			isPrivate: 0 | 1;
		}>();

		// a mapper's required fields must already be on the row
		expectTypeOf(testBuilds().withScore).returns.toBeNever();
		expectTypeOf(
			testBuilds().withTitleLength().withScore().execute,
		).returns.resolves.items.toHaveProperty("score");

		// each key is written by at most one step mapper
		expectTypeOf(
			testBuilds().withShoutedTitle().withExtraTitle,
		).returns.toBeNever();

		// @ts-expect-error a step rooted at another table
		testBuilds().with(refine("Badge", (qb) => qb));

		// @ts-expect-error the column has no foreign key to User
		UserRepository.withUser("user", "Build.title");

		// @ts-expect-error not a column of the root table
		testBuilds().where({ nope: 1 });
	});
});
