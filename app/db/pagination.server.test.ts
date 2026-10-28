import type { ExpressionBuilder } from "kysely";
import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Pagination from "./pagination.server";
import { db } from "./sql";
import type { DB } from "./tables";

const users = UserFactory.pool();
const firstUserId = () => users.id(4);

// the 4th user first, the rest tie and fall back to id order
const pageOfUsers = (
	args: Pick<
		Parameters<typeof Pagination.findPage>[0],
		"page" | "containingId" | "separateCount"
	>,
) =>
	Pagination.findPage({
		query: db.selectFrom("User").where("User.id", "in", users.ids()),
		id: "User.id",
		orderBy: [
			[
				(eb: ExpressionBuilder<DB, "User">) =>
					eb("User.id", "=", firstUserId()),
				"desc",
			],
		],
		pageSize: 2,
		rowsByIds: (ids) =>
			db
				.selectFrom("User")
				.select("User.id")
				.where("User.id", "in", ids)
				.orderBy("User.id", "desc")
				.execute(),
		...args,
	});

const idsOf = (rows: Array<{ id: number }>) => rows.map((row) => row.id);

describe("Pagination.findPage", () => {
	beforeEach(async () => {
		await users.create(5);
	});

	test("serves the page's rows in sort order, the id breaking ties", async () => {
		const result = await pageOfUsers({ page: 2 });

		expect(idsOf(result.items)).toEqual([users.id(2), users.id(3)]);
		expect(result.currentPage).toBe(2);
		expect(result.totalCount).toBe(5);
	});

	test("puts the first sort key before the id", async () => {
		const result = await pageOfUsers({ page: 1 });

		expect(idsOf(result.items)).toEqual([firstUserId(), users.id(1)]);
	});

	test("serves the page holding the containing id instead of the page asked for", async () => {
		const result = await pageOfUsers({ page: 1, containingId: users.id(5) });

		expect(result.currentPage).toBe(3);
		expect(idsOf(result.items)).toEqual([users.id(5)]);
	});

	test("falls back to the page asked for when the containing id is not among the rows", async () => {
		const result = await pageOfUsers({ page: 2, containingId: 999_999 });

		expect(result.currentPage).toBe(2);
	});

	test("counts the rows for a page past the end", async () => {
		const result = await pageOfUsers({ page: 9 });

		expect(result.items).toEqual([]);
		expect(result.totalCount).toBe(5);
	});

	test("counts the rows in their own query when asked to", async () => {
		const result = await pageOfUsers({ page: 2, separateCount: true });

		expect(idsOf(result.items)).toEqual([users.id(2), users.id(3)]);
		expect(result.totalCount).toBe(5);
	});
});
