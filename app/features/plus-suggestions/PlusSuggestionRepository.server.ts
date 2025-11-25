import { formatDistance } from "date-fns";
import type { Insertable, NotNull } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import type { MonthYear } from "~/features/plus-voting/core";
import { databaseTimestampToDate } from "~/utils/dates";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";

export type FindAllByMonthItem = Unwrapped<typeof findAllByMonth>;
export async function findAllByMonth(args: MonthYear) {
	const allRows = await db
		.selectFrom("PlusSuggestion")
		.select(({ eb }) => [
			"PlusSuggestion.id",
			"PlusSuggestion.createdAt",
			"PlusSuggestion.text",
			"PlusSuggestion.tier",
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select(COMMON_USER_FIELDS)
					.whereRef("PlusSuggestion.authorId", "=", "User.id"),
			).as("author"),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.leftJoin("PlusTier", "PlusSuggestion.suggestedId", "PlusTier.userId")
					.select([
						...COMMON_USER_FIELDS,
						"User.bio",
						"PlusTier.tier as plusTier",
					])
					.whereRef("PlusSuggestion.suggestedId", "=", "User.id"),
			).as("suggested"),
		])
		.where("PlusSuggestion.month", "=", args.month)
		.where("PlusSuggestion.year", "=", args.year)
		.orderBy("PlusSuggestion.createdAt", "asc")
		.$narrowType<{ author: NotNull; suggested: NotNull }>()
		.execute();

	// filter out suggestions that were made in the time period
	// between voting ending and people gaining access from the leaderboard
	const rows = allRows.filter(
		(r) => !r.suggested.plusTier || r.suggested.plusTier > r.tier,
	);

	type Row = (typeof rows)[number];

	const result: Array<{
		suggested: Row["suggested"];
		tier: Row["tier"];
		entries: Array<{
			author: Row["author"];
			createdAtRelative: string;
			createdAt: number;
			id: Row["id"];
			text: Row["text"];
		}>;
	}> = [];

	for (const row of rows) {
		const existing = result.find(
			(r) => r.tier === row.tier && row.suggested.id === r.suggested.id,
		);

		const entry = {
			id: row.id,
			text: row.text,
			createdAtRelative: formatDistance(
				databaseTimestampToDate(row.createdAt),
				new Date(),
				{ addSuffix: true },
			),
			createdAt: row.createdAt,
			author: row.author,
		};
		if (existing) {
			existing.entries.push(entry);
		} else {
			result.push({
				tier: row.tier,
				suggested: row.suggested,
				entries: [entry],
			});
		}
	}

	return result.sort((a, b) => b.entries[0].createdAt - a.entries[0].createdAt);
}

export function create(args: Insertable<DB["PlusSuggestion"]>) {
	return db.insertInto("PlusSuggestion").values(args).execute();
}

export function deleteById(id: number) {
	return db.deleteFrom("PlusSuggestion").where("id", "=", id).execute();
}

export function deleteWithCommentsBySuggestedUserId({
	tier,
	userId,
	month,
	year,
}: {
	tier: number;
	userId: number;
	month: number;
	year: number;
}) {
	return db
		.deleteFrom("PlusSuggestion")
		.where("PlusSuggestion.suggestedId", "=", userId)
		.where("PlusSuggestion.tier", "=", tier)
		.where("PlusSuggestion.month", "=", month)
		.where("PlusSuggestion.year", "=", year)
		.execute();
}
