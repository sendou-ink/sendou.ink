import { sub } from "date-fns";
import {
	type Expression,
	type ExpressionBuilder,
	type SqlBool,
	sql,
	type Transaction,
} from "kysely";
import { crud } from "~/db/crud";
import { defineQuery, refine, sortedBy, unchanged } from "~/db/entity-query";
import type { DB } from "~/db/tables";
import { actorId, actorIdOrNull } from "~/features/auth/core/user.server";
import * as UserCardRepository from "~/features/user-card/UserCardRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { UnifiedLanguageCode } from "~/modules/i18n/config";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import {
	mainWeaponIds,
	weaponIdToBaseWeaponId,
} from "~/modules/in-game-lists/weapon-ids";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
	jsonObjectFrom,
	matchProfileWeapons,
} from "~/utils/kysely.server";
import { timezonesWithinHours } from "./core/timezone";
import { LFG } from "./lfg-constants";

const postsTable = crud("LFGPost");

export const { insert, updateById, deleteById } = postsTable;

/**
 * LFG posts. Expired and plus tier restricted posts are hidden unless a step lifts the guard:
 * `visibleToActor` or `ownedByActor`. The filter steps take the filter's value as is and do
 * nothing when it is unset (`null` or empty).
 */
export const posts = defineQuery({
	root: "LFGPost",
	select: (qb) =>
		qb.select([
			"LFGPost.id",
			"LFGPost.authorId",
			"LFGPost.timezone",
			"LFGPost.type",
			"LFGPost.text",
			"LFGPost.createdAt",
			"LFGPost.updatedAt",
			"LFGPost.plusTierVisibility",
			"LFGPost.languages",
		]),
	map: (row) => ({
		permissions: {
			EDIT: [row.authorId],
			DELETE: [row.authorId],
		},
	}),
	defaultSort: [["LFGPost.updatedAt", "desc"]],
	guards: {
		hidden: (qb) =>
			qb
				.where("LFGPost.updatedAt", ">", freshnessCutoff())
				.where("LFGPost.plusTierVisibility", "is", null),
	},
	vocabulary: ({ lift }) => ({
		/** Fresh posts the actor's plus tier allows, plus all of their own (expired ones stay bumpable). */
		visibleToActor: () =>
			lift("hidden", (qb) =>
				qb.where((eb) => {
					const viewerId = actorIdOrNull();
					const fresh = eb("LFGPost.updatedAt", ">", freshnessCutoff());
					const unrestricted = eb("LFGPost.plusTierVisibility", "is", null);

					if (viewerId === null) return eb.and([fresh, unrestricted]);

					const viewerPlusTier = eb
						.selectFrom("PlusTier")
						.select("PlusTier.tier")
						.where("PlusTier.userId", "=", viewerId);

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
				}),
			),
		/** The actor's own posts, expired and restricted ones included. */
		ownedByActor: () =>
			lift("hidden", (qb) => qb.where("LFGPost.authorId", "=", actorId())),
		/** The author with what the post card shows of them. */
		withAuthor: () =>
			UserRepository.withUser("author", "LFGPost.authorId", [
				"plusTier",
				"country",
				"languages",
				"weaponPool",
				"card",
			]),
		/** The team a team post is made for, with its members, `null` for other posts. */
		withTeam: () =>
			refine("LFGPost", (qb) =>
				qb.select((eb) =>
					jsonObjectFrom(
						eb
							.selectFrom("Team")
							.leftJoin(
								"UserSubmittedImage",
								"UserSubmittedImage.id",
								"Team.avatarImgId",
							)
							.select((teamEb) => [
								"Team.id",
								"Team.name",
								concatUserSubmittedImagePrefix(
									teamEb.ref("UserSubmittedImage.url"),
								).as("avatarUrl"),
								jsonArrayFrom(
									teamEb
										.selectFrom("TeamMemberWithSecondary")
										.innerJoin(
											"User",
											"User.id",
											"TeamMemberWithSecondary.userId",
										)
										.leftJoin("PlusTier", "PlusTier.userId", "User.id")
										.select((memberEb) => [
											...commonUserSelect(memberEb),
											"User.languages",
											"User.country",
											"PlusTier.tier as plusTier",
											matchProfileWeapons(memberEb).as("weaponPool"),
											UserCardRepository.cardOf(memberEb.ref("User.id")).as(
												"card",
											),
										])
										.whereRef("TeamMemberWithSecondary.teamId", "=", "Team.id"),
								).as("members"),
							])
							.whereRef("Team.id", "=", "LFGPost.teamId")
							.where("Team.deletedAt", "is", null),
					).as("team"),
				),
			),
		/** The actor's own posts first, then the most recently bumped. */
		boardOrder: () => {
			const viewerId = actorIdOrNull();

			return sortedBy(
				"LFGPost",
				...(typeof viewerId === "number"
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
			);
		},
		newestFirst: () => sortedBy("LFGPost", ["LFGPost.updatedAt", "desc"]),
		/** Posts where the author or a team member has one of the weapons (or its variants) in their pool. Coach posts don't show weapons, so they never match. */
		withParticipantPlaying: (weapons: MainWeaponId[]) =>
			weapons.length === 0
				? unchanged("LFGPost")
				: participantFilter((eb, userId) =>
						eb.exists(
							eb
								.selectFrom("UserWeaponPool")
								.select("UserWeaponPool.userId")
								.where("UserWeaponPool.userId", "=", userId)
								.where(
									"UserWeaponPool.weaponSplId",
									"in",
									weapons.flatMap(weaponIdToRelated),
								),
						),
					),
		/** Posts where the author or a team member is in the plus server of `plusTier` or a better one. */
		withParticipantInPlusTier: (plusTier: number | null) =>
			plusTier === null
				? unchanged("LFGPost")
				: participantFilter(
						(eb, userId) =>
							eb.exists(
								eb
									.selectFrom("PlusTier")
									.select("PlusTier.userId")
									.where("PlusTier.userId", "=", userId)
									.where("PlusTier.tier", "<=", plusTier),
							),
						{ includingCoachPosts: true },
					),
		/** Posts where the author or a team member is one of `userIds`. Coach posts never match. */
		withParticipantAmong: (userIds: number[] | null) => {
			if (userIds === null) return unchanged("LFGPost");

			// not correlated to the post, so SQLite builds the id list's lookup table once per query
			const listedUserIds = sql<number>`(select "value" from json_each(${JSON.stringify(userIds)}))`;

			return refine("LFGPost", (qb) =>
				qb
					.where("LFGPost.type", "!=", "COACH_FOR_TEAM")
					.where((eb) =>
						eb.or([
							eb("LFGPost.authorId", "in", listedUserIds),
							eb(
								"LFGPost.teamId",
								"in",
								eb
									.selectFrom("TeamMemberWithSecondary")
									.select("TeamMemberWithSecondary.teamId")
									.where("TeamMemberWithSecondary.userId", "in", listedUserIds),
							),
						]),
					),
			);
		},
		inLanguage: (language: UnifiedLanguageCode | null) =>
			language === null
				? unchanged("LFGPost")
				: refine("LFGPost", (qb) =>
						qb.where(
							sql<SqlBool>`${language} in (select "value" from json_each("LFGPost"."languages"))`,
						),
					),
		/** Posts whose timezone's clock is at most `maxHourDifference` hours from the viewer's; no-op while the viewer's timezone is unknown. */
		inTimezoneWithin: (
			maxHourDifference: number | null,
			viewerTimezone: string | null,
		) =>
			maxHourDifference === null || viewerTimezone === null
				? unchanged("LFGPost")
				: refine("LFGPost", (qb) =>
						qb.where(
							"LFGPost.timezone",
							"in",
							timezonesWithinHours(viewerTimezone, maxHourDifference),
						),
					),
	}),
});

/** Moves the post back to the top of the board: an update with no changes only stamps `updatedAt`. */
export function bumpById(id: number) {
	return postsTable.updateById(id, {});
}

// xxx: why not trigger?
/** Deletes the posts made for the team, when it is deleted. */
export function deletePostsByTeamId(teamId: number, trx?: Transaction<DB>) {
	return postsTable.delete({ teamId }, trx);
}

function freshnessCutoff() {
	return dateToDatabaseTimestamp(
		sub(new Date(), { days: LFG.POST_FRESHNESS_DAYS }),
	);
}

type UserIdMatcher = (
	eb: ExpressionBuilder<DB, any>,
	userId: Expression<number>,
) => Expression<SqlBool>;

function participantFilter(
	matches: UserIdMatcher,
	{ includingCoachPosts = false } = {},
) {
	return refine("LFGPost", (qb) =>
		qb
			.$if(!includingCoachPosts, (coachQb) =>
				coachQb.where("LFGPost.type", "!=", "COACH_FOR_TEAM"),
			)
			.where((eb) =>
				eb.or([
					matches(eb, eb.ref("LFGPost.authorId")),
					eb.exists(
						eb
							.selectFrom("TeamMemberWithSecondary")
							.select("TeamMemberWithSecondary.userId")
							.whereRef("TeamMemberWithSecondary.teamId", "=", "LFGPost.teamId")
							.where((memberEb) =>
								matches(
									memberEb,
									memberEb.ref("TeamMemberWithSecondary.userId"),
								),
							),
					),
				]),
			),
	);
}

function weaponIdToRelated(weaponSplId: MainWeaponId) {
	return mainWeaponIds.filter(
		(id) => weaponIdToBaseWeaponId(id) === weaponIdToBaseWeaponId(weaponSplId),
	);
}
