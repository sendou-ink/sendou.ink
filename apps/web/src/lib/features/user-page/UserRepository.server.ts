import invariant from "@sendou/utils/invariant";
import type { ExpressionBuilder } from "kysely";
import { sql } from "kysely";
import * as R from "remeda";
import type { UserPreferences } from "#lib/db/tables-json.ts";
import { actorId } from "#lib/features/auth/user.server.ts";
import { userRoles } from "#lib/modules/permissions/mapper.server.ts";
import { db } from "#lib/server/db/sql.ts";
import type { DB } from "#lib/server/db/tables.ts";
import { commonUserSelect } from "#lib/server/kysely.ts";

/**
 * The lean user representation used for the authenticated user: common fields
 * plus the columns the app shell and permission checks need.
 */
export async function findLeanById(id: number) {
	const user = await db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.where("User.id", "=", id)
		.select(({ eb }) => [
			...commonUserSelect(eb),
			"User.createdAt",
			"User.customTheme",
			"User.isArtist",
			"User.isVideoAdder",
			"User.isTournamentOrganizer",
			"User.isApiAccesser",
			"User.patronTier",
			"User.languages",
			"User.inGameName",
			"User.preferences",
			"PlusTier.tier as plusTier",
			eb
				.selectFrom("UserFriendCode")
				.select("UserFriendCode.friendCode")
				.where("UserFriendCode.userId", "=", id)
				.orderBy("UserFriendCode.createdAt", "desc")
				.limit(1)
				.as("friendCode"),
		])
		.executeTakeFirst();

	if (!user) return;

	return {
		...R.omit(user, [
			"isArtist",
			"isVideoAdder",
			"isTournamentOrganizer",
			"isApiAccesser",
		]),
		roles: userRoles(user),
	};
}

/** Every current patron, highest tiers first, longest-running patrons first within a tier. */
export function findAllPatrons() {
	return db
		.selectFrom("User")
		.select(["User.id", "User.discordId", "User.username", "User.patronTier"])
		.where("User.patronTier", "is not", null)
		.orderBy("User.patronTier", "desc")
		.orderBy("User.patronStartedAt", "asc")
		.execute();
}

/** Every user in the plus server with their tier. */
export function findAllPlusServerMembers() {
	return db
		.selectFrom("User")
		.innerJoin("PlusTier", "PlusTier.userId", "User.id")
		.select([
			"User.id as userId",
			"User.discordId",
			"PlusTier.tier as plusTier",
		])
		.execute();
}

/** Users that currently have an active ban, keyed by user id. */
export async function findAllBannedUsers() {
	const rows = await db
		.selectFrom("User")
		.select(["User.id as userId", "User.banned", "User.bannedReason"])
		.where("User.banned", "!=", 0)
		.execute();

	const result: Map<number, (typeof rows)[number]> = new Map();

	for (const row of rows) {
		result.set(row.userId, row);
	}

	return result;
}

const searchSelectedFields = (eb: ExpressionBuilder<DB, "User">) =>
	[
		...commonUserSelect(eb),
		"User.inGameName",
		"User.tournamentName",
		"PlusTier.tier as plusTier",
		eb
			.fn<string | null>("iif", [
				"User.showDiscordUniqueName",
				"User.discordUniqueName",
				sql`null`,
			])
			.as("discordUniqueName"),
	] as const;
export async function search({
	query,
	limit,
}: {
	query: string;
	limit: number;
}) {
	// single scan over User with exact matches ranked first instead of two
	// separate scans (exact pass + fuzzy pass excluding exact ids)
	const exactConditions = (eb: ExpressionBuilder<DB, "User">) => [
		eb("User.username", "like", query),
		eb("User.inGameName", "like", query),
		eb("User.discordUniqueName", "like", query),
		eb("User.customUrl", "like", query),
	];

	const fuzzyQuery = `%${query}%`;
	const fuzzyConditions = (eb: ExpressionBuilder<DB, "User">) => [
		eb("User.username", "like", fuzzyQuery),
		eb("User.inGameName", "like", fuzzyQuery),
		eb("User.discordUniqueName", "like", fuzzyQuery),
	];

	const includeExactMatches = query.length > 1;

	// the trigram index needs at least 3 characters and can't replicate
	// LIKE wildcard semantics, those queries fall back to scanning User
	const canUseSearchIndex =
		query.length >= 3 && !query.includes("%") && !query.includes("_");

	let dbQuery = db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(searchSelectedFields)
		.where((eb) =>
			eb.or(
				includeExactMatches
					? [...fuzzyConditions(eb), ...exactConditions(eb)]
					: fuzzyConditions(eb),
			),
		);

	if (canUseSearchIndex) {
		// UserSearch match prefilters candidates via the trigram index (it
		// matches a superset of the LIKE conditions, which stay above as the
		// source of truth so results are identical to the fallback path)
		const ftsPhrase = `"${query.replaceAll('"', '""')}"`;
		dbQuery = dbQuery
			.innerJoin("UserSearch", "UserSearch.rowid", "User.id")
			.where(sql<boolean>`"UserSearch" match ${ftsPhrase}`);
	}

	if (includeExactMatches) {
		dbQuery = dbQuery.orderBy(
			(eb) =>
				eb
					.case()
					.when(eb.or(exactConditions(eb)))
					.then(0)
					.else(1)
					.end(),
			"asc",
		);
	}

	return (
		dbQuery
			.orderBy(
				(eb) =>
					eb
						.case()
						.when("PlusTier.tier", "is", null)
						.then(4)
						.else(eb.ref("PlusTier.tier"))
						.end(),
				"asc",
			)
			// deterministic order for ties so both query paths return the same rows
			.orderBy("User.id", "asc")
			.limit(limit)
			.execute()
	);
}

export function searchExact(args: {
	id?: number;
	discordId?: string;
	customUrl?: string;
}) {
	let query = db
		.selectFrom("User")
		.leftJoin("PlusTier", "PlusTier.userId", "User.id")
		.select(searchSelectedFields);

	let filtered = false;

	if (typeof args.id === "number") {
		filtered = true;
		query = query.where("User.id", "=", args.id);
	}

	if (typeof args.discordId === "string") {
		filtered = true;
		query = query.where("User.discordId", "=", args.discordId);
	}

	if (typeof args.customUrl === "string") {
		filtered = true;
		query = query.where("User.customUrl", "=", args.customUrl);
	}

	invariant(filtered, "No search criteria provided");

	return query.execute();
}

export function updateOwnPreferences(newPreferences: UserPreferences) {
	const userId = actorId();
	return db.transaction().execute(async (trx) => {
		const current =
			(
				await trx
					.selectFrom("User")
					.select("User.preferences")
					.where("id", "=", userId)
					.executeTakeFirstOrThrow()
			).preferences ?? {};

		const mergedPreferences = {
			...current,
			...newPreferences,
		};

		await trx
			.updateTable("User")
			.set({
				preferences: JSON.stringify(mergedPreferences),
			})
			.where("id", "=", userId)
			.execute();
	});
}

export async function anyUserPrefersNoScreen(
	userIds: number[],
): Promise<boolean> {
	if (userIds.length === 0) return false;

	const result = await db
		.selectFrom("User")
		.select("User.noScreen")
		.where("User.id", "in", userIds)
		.where("User.noScreen", "=", 1)
		.executeTakeFirst();

	return Boolean(result);
}
