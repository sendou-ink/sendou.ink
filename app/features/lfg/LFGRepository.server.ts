import { sub } from "date-fns";
import {
	type Expression,
	type ExpressionBuilder,
	type NotNull,
	sql,
	type SqlBool,
	type Transaction,
} from "kysely";
import * as Pagination from "~/db/pagination.server";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";
import { actorId, actorIdOrNull } from "~/features/auth/core/user.server";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import { databaseTimestampNow, dateToDatabaseTimestamp } from "~/utils/dates";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	matchProfileWeapons,
} from "~/utils/kysely.server";
import { LFG, type LFGType } from "./lfg-constants";

interface BoardFilters {
	type: LFGType | null;
	/** Posts where the author or a team member plays one of the weapons or another kit of it, coach posts never match. */
	weapons: MainWeaponId[];
	/** Posts where the author or a team member is in this plus server or a better one. */
	plusTier: number | null;
	language: UnifiedLanguageCode | null;
	/** Posts in one of these timezones, `null` for any timezone. */
	timezones: string[] | null;
	/** Posts among these ids, `null` for any post. */
	postIds: number[] | null;
}

/**
 * Page of the LFG board as the actor sees it: their own posts first, then the most recently
 * bumped. Expired posts are only shown to their author, plus tier restricted ones to members
 * of the tier or a better one.
 */
export function findBoardPage({
	filters,
	page,
	pageSize,
	containingPostId,
}: {
	filters: BoardFilters;
	page: number;
	pageSize: number;
	/** Serves the page holding this post instead of `page`, when it is on the board. */
	containingPostId: number | null;
}) {
	const viewerId = actorIdOrNull();

	return Pagination.findPage({
		query: filteredBoardPosts(filters, viewerId),
		id: "LFGPost.id",
		orderBy: [
			...(viewerId !== null
				? [
						[
							(eb: ExpressionBuilder<DB, "LFGPost">) =>
								eb("LFGPost.authorId", "=", viewerId),
							"desc",
						] as const,
					]
				: []),
			["LFGPost.updatedAt", "desc"],
			["LFGPost.type", "asc"],
		],
		page,
		pageSize,
		containingId: containingPostId,
		rowsByIds: (ids) =>
			postsQuery()
				.where("LFGPost.id", "in", ids)
				.execute()
				.then((rows) => rows.map(withPermissions)),
	});
}

/** The post if it is visible to the actor, see {@link findBoardPage}. */
export async function findVisibleById(id: number) {
	const viewerId = actorIdOrNull();

	const row = await postsQuery()
		.where("LFGPost.id", "=", id)
		.where((eb) => isVisibleTo(eb, viewerId))
		.executeTakeFirst();

	return row ? withPermissions(row) : undefined;
}

/** The actor's own posts, expired and plus tier restricted ones included. */
export async function findAllOwn() {
	const rows = await postsQuery()
		.where("LFGPost.authorId", "=", actorId())
		.execute();

	return rows.map(withPermissions);
}

/** Posts of one author visible to the actor, see {@link findBoardPage}. */
export function findByAuthorUserId(authorId: number) {
	const viewerId = actorIdOrNull();

	return db
		.selectFrom("LFGPost")
		.select(["LFGPost.id", "LFGPost.type"])
		.where("LFGPost.authorId", "=", authorId)
		.where((eb) => isVisibleTo(eb, viewerId))
		.orderBy("LFGPost.updatedAt", "desc")
		.execute();
}

/** User ids of the author and team members of every post visible to the actor, see {@link findBoardPage}. */
export async function findAllVisibleParticipantIds() {
	const viewerId = actorIdOrNull();

	const rows = await db
		.selectFrom("LFGPost")
		.select((eb) => [
			"LFGPost.id",
			"LFGPost.type",
			"LFGPost.authorId",
			jsonArrayFrom(
				eb
					.selectFrom("TeamMemberWithSecondary")
					.select("TeamMemberWithSecondary.userId")
					.whereRef("TeamMemberWithSecondary.teamId", "=", "LFGPost.teamId"),
			).as("teamMembers"),
		])
		.where((eb) => isVisibleTo(eb, viewerId))
		.execute();

	return rows.map((row) => ({
		id: row.id,
		type: row.type,
		participantIds: [
			row.authorId,
			...row.teamMembers.map((member) => member.userId),
		],
	}));
}

export function insertPost(
	args: Omit<TablesInsertable["LFGPost"], "updatedAt">,
) {
	return db
		.insertInto("LFGPost")
		.values(args)
		.returning("id")
		.executeTakeFirstOrThrow();
}

export function updatePost(
	postId: number,
	args: Omit<TablesInsertable["LFGPost"], "updatedAt" | "authorId">,
) {
	return db
		.updateTable("LFGPost")
		.set({
			teamId: args.teamId,
			text: args.text,
			timezone: args.timezone,
			type: args.type,
			plusTierVisibility: args.plusTierVisibility,
			languages: args.languages,
			updatedAt: databaseTimestampNow(),
		})
		.where("id", "=", postId)
		.execute();
}

export function bumpPost(postId: number) {
	return db
		.updateTable("LFGPost")
		.set({
			updatedAt: databaseTimestampNow(),
		})
		.where("id", "=", postId)
		.execute();
}

export function deletePost(id: number) {
	return db.deleteFrom("LFGPost").where("id", "=", id).execute();
}

export function deletePostsByTeamId(teamId: number, trx?: Transaction<DB>) {
	return (trx ?? db)
		.deleteFrom("LFGPost")
		.where("teamId", "=", teamId)
		.execute();
}

function postsQuery() {
	return db
		.selectFrom("LFGPost")
		.select(({ eb }) => [
			"LFGPost.id",
			"LFGPost.timezone",
			"LFGPost.type",
			"LFGPost.text",
			"LFGPost.createdAt",
			"LFGPost.updatedAt",
			"LFGPost.plusTierVisibility",
			"LFGPost.languages",
			jsonObjectFrom(
				eb
					.selectFrom("User")
					.leftJoin("PlusTier", "PlusTier.userId", "User.id")
					.select(({ eb: innerEb }) => [
						...commonUserSelect(innerEb),
						"User.languages",
						"User.country",
						"PlusTier.tier as plusTier",
						matchProfileWeapons(innerEb).as("weaponPool"),
					])
					.whereRef("User.id", "=", "LFGPost.authorId"),
			).as("author"),
			jsonObjectFrom(
				eb
					.selectFrom("Team")
					.leftJoin(
						"UserSubmittedImage",
						"UserSubmittedImage.id",
						"Team.avatarImgId",
					)
					.select(({ eb: innerEb }) => [
						"Team.id",
						"Team.name",
						concatUserSubmittedImagePrefix(
							innerEb.ref("UserSubmittedImage.url"),
						).as("avatarUrl"),
						jsonArrayFrom(
							innerEb
								.selectFrom("TeamMemberWithSecondary")
								.innerJoin("User", "User.id", "TeamMemberWithSecondary.userId")
								.leftJoin("PlusTier", "PlusTier.userId", "User.id")
								.select(({ eb: innestEb }) => [
									...commonUserSelect(innestEb),
									"User.languages",
									"User.country",
									"PlusTier.tier as plusTier",
									matchProfileWeapons(innestEb).as("weaponPool"),
								])
								.whereRef("TeamMemberWithSecondary.teamId", "=", "Team.id"),
						).as("members"),
					])
					.whereRef("Team.id", "=", "LFGPost.teamId"),
			).as("team"),
		])
		.$narrowType<{ author: NotNull }>();
}

function withPermissions<T extends { author: { id: number } }>(row: T) {
	return {
		...row,
		permissions: {
			EDIT: [row.author.id],
			DELETE: [row.author.id],
		},
	};
}

function isVisibleTo(
	eb: ExpressionBuilder<DB, "LFGPost">,
	viewerId: number | null,
) {
	const fresh = eb(
		"LFGPost.updatedAt",
		">",
		dateToDatabaseTimestamp(sub(new Date(), { days: LFG.POST_FRESHNESS_DAYS })),
	);
	const unrestricted = eb("LFGPost.plusTierVisibility", "is", null);

	if (viewerId === null) return eb.and([fresh, unrestricted]);

	const viewerPlusTier = eb
		.selectFrom("PlusTier")
		.select("PlusTier.tier")
		.where("PlusTier.userId", "=", viewerId);

	// the author keeps seeing their expired and restricted posts so they can still bump or delete them
	return eb.or([
		eb("LFGPost.authorId", "=", viewerId),
		eb.and([
			fresh,
			eb.or([
				unrestricted,
				eb("LFGPost.plusTierVisibility", ">=", viewerPlusTier),
			]),
		]),
	]);
}

function filteredBoardPosts(filters: BoardFilters, viewerId: number | null) {
	let query = db.selectFrom("LFGPost").where((eb) => isVisibleTo(eb, viewerId));

	if (filters.type) {
		query = query.where("LFGPost.type", "=", filters.type);
	}
	if (filters.weapons.length > 0) {
		const weaponIds = filters.weapons.flatMap(weaponIdToKits);

		query = query
			.where("LFGPost.type", "!=", "COACH_FOR_TEAM")
			.where((eb) =>
				hasParticipant(eb, (userId) =>
					eb.exists(
						eb
							.selectFrom("UserWeaponPool")
							.select("UserWeaponPool.userId")
							.where("UserWeaponPool.userId", "=", userId)
							.where("UserWeaponPool.weaponSplId", "in", weaponIds),
					),
				),
			);
	}
	if (filters.plusTier !== null) {
		const plusTier = filters.plusTier;

		query = query.where((eb) =>
			hasParticipant(eb, (userId) =>
				eb.exists(
					eb
						.selectFrom("PlusTier")
						.select("PlusTier.userId")
						.where("PlusTier.userId", "=", userId)
						.where("PlusTier.tier", "<=", plusTier),
				),
			),
		);
	}
	if (filters.language) {
		query = query.where(
			sql<SqlBool>`${filters.language} in (select "value" from json_each("LFGPost"."languages"))`,
		);
	}
	if (filters.timezones) {
		query = query.where(
			"LFGPost.timezone",
			"in",
			jsonEachValues(filters.timezones),
		);
	}
	if (filters.postIds) {
		query = query.where("LFGPost.id", "in", jsonEachValues(filters.postIds));
	}

	return query;
}

/** The author matches or the post's team has a member who does. */
function hasParticipant(
	eb: ExpressionBuilder<DB, "LFGPost">,
	matches: (userId: Expression<number>) => Expression<SqlBool>,
) {
	return eb.or([
		matches(eb.ref("LFGPost.authorId")),
		eb.exists(
			eb
				.selectFrom("TeamMemberWithSecondary")
				.select("TeamMemberWithSecondary.userId")
				.whereRef("TeamMemberWithSecondary.teamId", "=", "LFGPost.teamId")
				.where((memberEb) =>
					matches(memberEb.ref("TeamMemberWithSecondary.userId")),
				),
		),
	]);
}

// one bound parameter however long the list, and an empty list matches nothing instead of being invalid SQL
function jsonEachValues<T extends string | number>(values: T[]) {
	return sql<T>`(select "value" from json_each(${JSON.stringify(values)}))`;
}

function weaponIdToKits(weaponSplId: MainWeaponId) {
	return mainWeaponIds.filter(
		(id) => weaponIdToBaseWeaponId(id) === weaponIdToBaseWeaponId(weaponSplId),
	);
}
