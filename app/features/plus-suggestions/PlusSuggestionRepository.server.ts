import { formatDistance } from "date-fns";
import type { ExpressionBuilder, Insertable, NotNull } from "kysely";
import { db } from "~/db/sql";
import type { DB } from "~/db/tables";
import { isVotingActive, type MonthYear } from "~/features/plus-voting/core";
import { databaseTimestampNow, databaseTimestampToDate } from "~/utils/dates";
import { commonUserSelect, jsonObjectFrom } from "~/utils/kysely.server";
import type { Unwrapped } from "~/utils/types";
import {
	isPlusTier,
	type PlusTier,
	ZERO_SUGGESTION_COUNTS,
} from "./plus-suggestions-constants";

export type FindAllByMonthItem = Unwrapped<typeof findAllByMonth>;

export async function findAllByMonth(args: MonthYear & { tier?: number }) {
	let query = db
		.selectFrom("PlusSuggestion")
		.select(({ eb }) => [
			"PlusSuggestion.id",
			"PlusSuggestion.createdAt",
			"PlusSuggestion.updatedAt",
			"PlusSuggestion.text",
			"PlusSuggestion.tier",
			suggestedPlusTier(eb),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select(["User.id", "User.username"])
					.whereRef("PlusSuggestion.authorId", "=", "User.id"),
			).as("author"),
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.select((eb) => commonUserSelect(eb))
					.whereRef("PlusSuggestion.suggestedId", "=", "User.id"),
			).as("suggested"),
		])
		.where("PlusSuggestion.month", "=", args.month)
		.where("PlusSuggestion.year", "=", args.year);

	if (typeof args.tier === "number") {
		query = query.where("PlusSuggestion.tier", "=", args.tier);
	}

	const allRows = await query
		.orderBy("PlusSuggestion.createdAt", "asc")
		.$narrowType<{ author: NotNull; suggested: NotNull }>()
		.execute();

	// drops suggestions made between voting ending and people gaining access from the leaderboard
	const rows = allRows.filter(
		(r) => !r.suggestedPlusTier || r.suggestedPlusTier > r.tier,
	);

	type Row = (typeof rows)[number];

	const result: Array<{
		suggested: Row["suggested"];
		tier: Row["tier"];
		entries: Array<{
			author: Row["author"];
			createdAtRelative: string;
			createdAt: number;
			updatedAt: number | null;
			updatedAtRelative: string | null;
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
			updatedAt: row.updatedAt,
			updatedAtRelative: row.updatedAt
				? formatDistance(databaseTimestampToDate(row.updatedAt), new Date(), {
						addSuffix: true,
					})
				: null,
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

	const votingActive =
		process.env.NODE_ENV === "test" ? false : isVotingActive();

	return result
		.sort((a, b) => b.entries[0].createdAt - a.entries[0].createdAt)
		.map((suggestion) => ({
			...suggestion,
			entries: suggestion.entries.map((entry, index) => ({
				...entry,
				permissions: entryPermissions({
					authorId: entry.author.id,
					isFirstSuggestion: index === 0,
					entryCount: suggestion.entries.length,
					votingActive,
				}),
			})),
		}));
}

export interface MonthSummary {
	/** How many users have been suggested, per tier. */
	suggestionCountsByTier: Record<PlusTier, number>;
	/** Tiers `userId` has themselves been suggested to. */
	suggestedForTiers: Array<PlusTier>;
	/** Whether `userId` has started a suggestion of their own this month. */
	hasSuggested: boolean;
}

export async function findMonthSummary(
	args: MonthYear & { userId: number | null },
): Promise<MonthSummary> {
	const rows = await db
		.selectFrom("PlusSuggestion")
		.select(({ eb }) => [
			"PlusSuggestion.tier",
			"PlusSuggestion.suggestedId",
			"PlusSuggestion.authorId",
			suggestedPlusTier(eb),
		])
		.where("PlusSuggestion.month", "=", args.month)
		.where("PlusSuggestion.year", "=", args.year)
		.orderBy("PlusSuggestion.createdAt", "asc")
		.execute();

	const suggestionCountsByTier = { ...ZERO_SUGGESTION_COUNTS };
	const suggestedForTiers: Array<PlusTier> = [];
	const seenSuggestions = new Set<string>();
	let hasSuggested = false;

	for (const row of rows) {
		if (row.suggestedPlusTier && row.suggestedPlusTier <= row.tier) continue;
		if (!isPlusTier(row.tier)) continue;

		// rows are in creation order: the first row of a suggestion started it, later ones are comments
		const key = `${row.tier}-${row.suggestedId}`;
		if (seenSuggestions.has(key)) continue;
		seenSuggestions.add(key);

		suggestionCountsByTier[row.tier]++;
		if (row.suggestedId === args.userId) suggestedForTiers.push(row.tier);
		if (row.authorId === args.userId) hasSuggested = true;
	}

	return { suggestionCountsByTier, suggestedForTiers, hasSuggested };
}

export function insert(args: Insertable<DB["PlusSuggestion"]>) {
	return db
		.insertInto("PlusSuggestion")
		.values(args)
		.returning("id")
		.executeTakeFirstOrThrow();
}

export function updateTextById(id: number, text: string) {
	return db
		.updateTable("PlusSuggestion")
		.set({ text, updatedAt: databaseTimestampNow() })
		.where("id", "=", id)
		.execute();
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

// the first entry is the suggestion itself; deleting it deletes the whole
// suggestion which the author may only do while it has no comments
function entryPermissions({
	authorId,
	isFirstSuggestion,
	entryCount,
	votingActive,
}: {
	authorId: number;
	isFirstSuggestion: boolean;
	entryCount: number;
	votingActive: boolean;
}) {
	if (!isFirstSuggestion) {
		return { EDIT: [], DELETE: [authorId] };
	}

	if (votingActive) {
		return { EDIT: [], DELETE: [] };
	}

	return {
		EDIT: [authorId],
		DELETE: entryCount === 1 ? [authorId] : [],
	};
}

/** Plus tier the suggested user already has, if any. */
function suggestedPlusTier(eb: ExpressionBuilder<DB, "PlusSuggestion">) {
	return eb
		.selectFrom("PlusTier")
		.select("PlusTier.tier")
		.whereRef("PlusTier.userId", "=", "PlusSuggestion.suggestedId")
		.as("suggestedPlusTier");
}
