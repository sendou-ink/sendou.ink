import { formatDistance } from "date-fns";
import type { Insertable } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import type { MonthYear } from "~/features/plus-voting/core";
import { databaseTimestampToDate } from "~/utils/dates";
import { COMMON_USER_FIELDS } from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";

// TODO: can be made better when $narrowNotNull lands
type FindAllByMonthRow = {
	tier: number;
	id: number;
	text: string;
	createdAt: number;
	author: {
		id: number;
		username: string;
		discordId: string;
		discordAvatar: string | null;
	};
	suggested: {
		id: number;
		username: string;
		discordId: string;
		discordAvatar: string | null;
		bio: string | null;
		plusTier: number | null;
	};
};

// TODO: naming is a bit weird here (suggestion inside suggestions)
export type FindAllByMonthItem = Unwrapped<typeof findAllByMonth>;
export async function findAllByMonth(args: MonthYear) {
	const allRows = (await db
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
		.execute()) as FindAllByMonthRow[];

	// filter out suggestions that were made in the time period
	// between voting ending and people gaining access from the leaderboard
	const rows = allRows.filter(
		(r) => !r.suggested.plusTier || r.suggested.plusTier > r.tier,
	);

	const result: Array<{
		suggested: FindAllByMonthRow["suggested"];
		tier: FindAllByMonthRow["tier"];
		suggestions: Array<{
			author: FindAllByMonthRow["author"];
			createdAtRelative: string;
			createdAt: number;
			id: FindAllByMonthRow["id"];
			text: FindAllByMonthRow["text"];
		}>;
	}> = [];

	for (const row of rows) {
		const existing = result.find(
			(suggestion) =>
				suggestion.tier === row.tier &&
				row.suggested.id === suggestion.suggested.id,
		);

		const mappedSuggestion = {
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
			existing.suggestions.push(mappedSuggestion);
		} else {
			result.push({
				tier: row.tier,
				suggested: row.suggested,
				suggestions: [mappedSuggestion],
			});
		}
	}

	return result.sort(
		(a, b) => b.suggestions[0].createdAt - a.suggestions[0].createdAt,
	);
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
