import { sql } from "kysely";
import { beforeEach, describe, expect, expectTypeOf, test } from "vitest";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as VodFactory from "~/db/seed/factories/VodFactory";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { jsonObjectFrom } from "~/utils/kysely.server";
import { withNoUser } from "~/utils/Test";
import {
	defineQuery,
	defineResolver,
	mapRows,
	refine,
	sortedBy,
} from "./entity-query";

const users = UserFactory.pool();

const ownerTagLoads: number[][] = [];
const ownerTag = defineResolver("testOwnerTag", async (ownerIds) => {
	ownerTagLoads.push(ownerIds);
	return new Map(
		ownerIds.filter((id) => id > 0).map((id) => [id, `owner-${id}`]),
	);
});

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

	test("resolves every key of the rows in one load, nested JSON included", async () => {
		ownerTagLoads.length = 0;

		const rows = await testBuilds()
			.with(
				refine("Build", (qb) =>
					qb.select((eb) => [
						ownerTag(eb.ref("Build.ownerId")).as("tag"),
						jsonObjectFrom(
							eb
								.selectFrom("User")
								.select((userEb) => ownerTag(userEb.ref("User.id")).as("tag"))
								.whereRef("User.id", "=", "Build.ownerId"),
						).as("owner"),
					]),
				),
			)
			.execute();

		expect(rows.map((row) => [row.tag, row.owner?.tag])).toEqual([
			[`owner-${users.id(1)}`, `owner-${users.id(1)}`],
			[`owner-${users.id(2)}`, `owner-${users.id(2)}`],
		]);
		expect(ownerTagLoads).toEqual([[users.id(1), users.id(2)]]);
	});

	test("resolves a null key and a key the load lacks to null", async () => {
		const [row] = await testBuilds()
			.with(
				refine("Build", (qb) =>
					qb.select([
						ownerTag(sql<number | null>`null`).as("nullKey"),
						ownerTag(sql<number>`-1`).as("missingKey"),
					]),
				),
			)
			.execute();

		expect(row).toMatchObject({ nullKey: null, missingKey: null });
	});

	test("withUser resolves the card extra", async () => {
		const [row] = await withNoUser(() =>
			testBuilds()
				.with(UserRepository.withUser("owner", "Build.ownerId", ["card"]))
				.execute(),
		);

		expect(row.owner.card).toMatchObject({ id: users.id(1) });
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

describe("paginate", () => {
	const buildIds: number[] = [];
	let privateBuildId: number;

	// titles sort c, b, b, a, a descending; equal titles fall back to id order
	beforeEach(async () => {
		await users.create(2);
		buildIds.length = 0;
		for (const [ownerIdx, title] of [
			[1, "a"],
			[2, "a"],
			[1, "b"],
			[2, "b"],
			[1, "c"],
		] as const) {
			const { id } = await BuildFactory.create({
				ownerId: users.id(ownerIdx),
				title,
			});
			buildIds.push(id);
		}
		({ id: privateBuildId } = await BuildFactory.create({
			ownerId: users.id(1),
			title: "z",
			isPrivate: 1,
		}));
	});

	const inTitleDescOrder = () => [
		buildIds[4],
		buildIds[2],
		buildIds[3],
		buildIds[0],
		buildIds[1],
	];

	const idsOf = (rows: Array<{ id: number }>) => rows.map((row) => row.id);

	test("serves numbered pages in sort order, the id breaking ties", async () => {
		const pages = await Promise.all(
			[1, 2, 3].map((page) =>
				testBuilds().titleDesc().paginate({ page, size: 2 }),
			),
		);

		expect(pages.flatMap((page) => idsOf(page.items))).toEqual(
			inTitleDescOrder(),
		);
		expect(pages[0]).toMatchObject({
			currentPage: 1,
			pagesCount: 3,
			totalCount: 5,
		});
	});

	test("runs the full shape and mappers on the page rows", async () => {
		const { items } = await testBuilds()
			.titleDesc()
			.withTitleLength()
			.paginate({ page: 1, size: 1 });

		expect(items).toEqual([
			expect.objectContaining({ id: buildIds[4], title: "C", titleLength: 1 }),
		]);
	});

	test("serves the page containing a row", async () => {
		const page = await testBuilds()
			.titleDesc()
			.paginate({ page: 1, size: 2, containing: buildIds[0] });

		expect(page.currentPage).toBe(2);
		expect(idsOf(page.items)).toContain(buildIds[0]);
	});

	test("keeps the page asked for when the containing row is filtered out", async () => {
		const page = await testBuilds()
			.titleDesc()
			.paginate({ page: 3, size: 2, containing: privateBuildId });

		expect(page.currentPage).toBe(3);
	});

	test("walks every row exactly once with cursors", async () => {
		const seen: number[] = [];
		let after: string | null = null;
		do {
			const page: { items: Array<{ id: number }>; nextCursor: string | null } =
				await testBuilds().titleDesc().paginate({ after, size: 2 });
			seen.push(...idsOf(page.items));
			after = page.nextCursor;
		} while (after);

		expect(seen).toEqual(inTitleDescOrder());
	});

	test.each([
		{ why: "not base64 JSON", cursor: "garbage" },
		{
			why: "wrong key count",
			cursor: Buffer.from("[1]").toString("base64url"),
		},
		{
			why: "non-scalar value",
			cursor: Buffer.from('[{"a":1},2]').toString("base64url"),
		},
	])("a tampered cursor serves the first page ($why)", async ({ cursor }) => {
		const page = await testBuilds()
			.titleDesc()
			.paginate({ after: cursor, size: 2 });

		expect(idsOf(page.items)).toEqual(inTitleDescOrder().slice(0, 2));
	});

	test("walks every row exactly once with cursors on a timestamp sort key", async () => {
		const videos = defineQuery({
			root: "Video",
			select: (qb) => qb.select("Video.id"),
			defaultSort: [["Video.youtubePublishedAt", "desc"]],
		});
		const videoIds: number[] = [];
		for (const day of [2, 1, 2]) {
			const { id } = await VodFactory.create({
				submitterUserId: users.id(1),
				date: { day, month: 0, year: 2024 },
			});
			videoIds.push(id);
		}

		const seen: number[] = [];
		let after: string | null = null;
		do {
			const page: { items: Array<{ id: number }>; nextCursor: string | null } =
				await videos().paginate({ after, size: 1 });
			seen.push(...idsOf(page.items));
			after = page.nextCursor;
		} while (after);

		expect(seen).toEqual([videoIds[0], videoIds[2], videoIds[1]]);
	});

	test("seeks through an expression sort key", async () => {
		const secondOwnerFirst = sortedBy("Build", [
			(eb) => eb("Build.ownerId", "=", users.id(2)),
			"desc",
		]);

		const seen: number[] = [];
		let after: string | null = null;
		do {
			const page: { items: Array<{ id: number }>; nextCursor: string | null } =
				await testBuilds().with(secondOwnerFirst).paginate({ after, size: 1 });
			seen.push(...idsOf(page.items));
			after = page.nextCursor;
		} while (after);

		expect(seen).toEqual([
			buildIds[1],
			buildIds[3],
			buildIds[0],
			buildIds[2],
			buildIds[4],
		]);
	});

	test("throws when a refine step sorts with orderBy", async () => {
		await expect(
			testBuilds().sortedInsideRefine().paginate({ page: 1, size: 2 }),
		).rejects.toThrow("sortedBy");
	});
});
