import { type ExpressionBuilder, sql, type Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
} from "~/utils/kysely.server";
import { seededRandom } from "~/utils/random";
import type { ListedArt } from "./art-types";

export function unlinkOwnFromArt(artId: number) {
	return db
		.deleteFrom("ArtUserMetadata")
		.where("artId", "=", artId)
		.where("userId", "=", actorId())
		.execute();
}

function getDailySeed() {
	const today = new Date();
	const year = today.getFullYear();
	const month = today.getMonth() + 1;
	const day = today.getDate();
	return `${year}-${month}-${day}`;
}

export async function findShowcaseArts(): Promise<ListedArt[]> {
	const arts = await db
		.selectFrom((eb) =>
			eb
				// each author's most recent art (showcase first) via SQLite's max() + bare column rule,
				// packed into one integer since createdAt always stays below the isShowcase component
				.selectFrom("Art")
				.innerJoin("User", "User.id", "Art.authorId")
				.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
				.select(({ fn }) => [
					"Art.id as artId",
					fn
						.max(
							sql<number>`"Art"."isShowcase" * 10000000000 + "Art"."createdAt"`,
						)
						.as("packedShowcaseCreatedAt"),
				])
				.groupBy("Art.authorId")
				.as("BestOfAuthor"),
		)
		.innerJoin("Art", "Art.id", "BestOfAuthor.artId")
		.innerJoin("User", "User.id", "Art.authorId")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select((eb) => [
			"Art.id",
			"Art.createdAt",
			"Art.isShowcase",
			...commonUserSelect(eb, { idAs: "userId" }),
			"User.commissionsOpen",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"url",
			),
			linkedUsersSubquery(eb).as("linkedUsers"),
		])
		.orderBy("Art.isShowcase", "desc")
		.orderBy("Art.createdAt", "desc")
		.orderBy("User.id", "asc")
		.execute();

	const mappedArts = arts.map((a) => ({
		id: a.id,
		createdAt: a.createdAt,
		url: a.url,
		isShowcase: Boolean(a.isShowcase),
		author: {
			commissionsOpen: a.commissionsOpen,
			discordAvatar: a.discordAvatar,
			customAvatarUrl: a.customAvatarUrl,
			discordId: a.discordId,
			username: a.username,
		},
		permissions: artPermissions({
			authorId: a.userId,
			linkedUsers: a.linkedUsers,
		}),
	}));

	const { seededShuffle } = seededRandom(getDailySeed());
	return seededShuffle(mappedArts);
}

export async function findShowcaseArtsByTag(
	tagId: Tables["ArtTag"]["id"],
): Promise<ListedArt[]> {
	const arts = await db
		.selectFrom("TaggedArt")
		.innerJoin("Art", "Art.id", "TaggedArt.artId")
		.innerJoin("User", "User.id", "Art.authorId")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select((eb) => [
			"Art.id",
			"Art.createdAt",
			"Art.isShowcase",
			...commonUserSelect(eb, { idAs: "userId" }),
			"User.commissionsOpen",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"url",
			),
			linkedUsersSubquery(eb).as("linkedUsers"),
		])
		.where("TaggedArt.tagId", "=", tagId)
		.orderBy("Art.isShowcase", "desc")
		.orderBy("Art.createdAt", "desc")
		.execute();

	const encounteredUserIds = new Set<number>();

	return arts
		.filter((row) => {
			if (encounteredUserIds.has(row.userId)) {
				return false;
			}

			encounteredUserIds.add(row.userId);

			return true;
		})
		.map((a) => ({
			id: a.id,
			createdAt: a.createdAt,
			url: a.url,
			isShowcase: Boolean(a.isShowcase),
			author: {
				commissionsOpen: a.commissionsOpen,
				discordAvatar: a.discordAvatar,
				customAvatarUrl: a.customAvatarUrl,
				discordId: a.discordId,
				username: a.username,
			},
			permissions: artPermissions({
				authorId: a.userId,
				linkedUsers: a.linkedUsers,
			}),
		}));
}

export async function findRecentlyUploadedArts(): Promise<ListedArt[]> {
	const arts = await db
		.selectFrom("Art")
		.innerJoin("User", "User.id", "Art.authorId")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select((eb) => [
			"Art.id",
			"Art.createdAt",
			"Art.isShowcase",
			...commonUserSelect(eb, { idAs: "userId" }),
			"User.commissionsOpen",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"url",
			),
			linkedUsersSubquery(eb).as("linkedUsers"),
		])
		.orderBy("Art.createdAt", "desc")
		.limit(100)
		.execute();

	return arts.map((a) => ({
		id: a.id,
		createdAt: a.createdAt,
		url: a.url,
		isShowcase: Boolean(a.isShowcase),
		author: {
			commissionsOpen: a.commissionsOpen,
			discordAvatar: a.discordAvatar,
			customAvatarUrl: a.customAvatarUrl,
			discordId: a.discordId,
			username: a.username,
		},
		permissions: artPermissions({
			authorId: a.userId,
			linkedUsers: a.linkedUsers,
		}),
	}));
}

export async function findAllTags() {
	return db.selectFrom("ArtTag").select(["id", "name"]).execute();
}

export async function deleteOrphanTags() {
	const result = await db
		.deleteFrom("ArtTag")
		.where("id", "not in", db.selectFrom("TaggedArt").select("TaggedArt.tagId"))
		.executeTakeFirst();

	return Number(result.numDeletedRows);
}

/** Art by its id, with the ids of the users tagged in it. */
export async function findById(id: Tables["Art"]["id"]) {
	const row = await db
		.selectFrom("Art")
		.select(({ eb }) => [
			"Art.id",
			"Art.authorId",
			linkedUsersSubquery(eb).as("linkedUsers"),
		])
		.where("Art.id", "=", id)
		.executeTakeFirst();

	if (!row) return;

	return {
		id: row.id,
		linkedUserIds: row.linkedUsers.map((linkedUser) => linkedUser.id),
		permissions: artPermissions({
			authorId: row.authorId,
			linkedUsers: row.linkedUsers,
		}),
	};
}

export async function findArtsByUserId(
	userId: number,
	{ includeAuthored = true, includeTagged = true } = {},
): Promise<ListedArt[]> {
	const taggedButNotAuthored = includeTagged
		? await db
				.selectFrom("Art")
				.innerJoin("ArtUserMetadata", "ArtUserMetadata.artId", "Art.id")
				.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
				.innerJoin("User", "User.id", "Art.authorId")
				.select(({ eb }) => [
					"Art.id",
					"Art.description",
					"Art.createdAt",
					"Art.isShowcase",
					concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
						"url",
					),
					...commonUserSelect(eb, { idAs: "userId" }),
					"User.commissionsOpen",
					jsonArrayFrom(
						eb
							.selectFrom("TaggedArt")
							.innerJoin("ArtTag", "ArtTag.id", "TaggedArt.tagId")
							.select(["ArtTag.id", "ArtTag.name"])
							.whereRef("TaggedArt.artId", "=", "Art.id"),
					).as("tags"),
					jsonArrayFrom(
						eb
							.selectFrom("ArtUserMetadata")
							.innerJoin(
								"User as LinkedUser",
								"LinkedUser.id",
								"ArtUserMetadata.userId",
							)
							.select((linkedEb) =>
								commonUserSelect(linkedEb, { alias: "LinkedUser" }),
							)
							.whereRef("ArtUserMetadata.artId", "=", "Art.id"),
					).as("linkedUsers"),
				])
				.where("ArtUserMetadata.userId", "=", userId)
				.where("Art.authorId", "!=", userId)
				.execute()
		: [];

	const authored = includeAuthored
		? await db
				.selectFrom("Art")
				.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
				.select(({ eb }) => [
					"Art.id",
					"Art.description",
					"Art.createdAt",
					"Art.isShowcase",
					concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
						"url",
					),
					jsonArrayFrom(
						eb
							.selectFrom("TaggedArt")
							.innerJoin("ArtTag", "ArtTag.id", "TaggedArt.tagId")
							.select(["ArtTag.id", "ArtTag.name"])
							.whereRef("TaggedArt.artId", "=", "Art.id"),
					).as("tags"),
					jsonArrayFrom(
						eb
							.selectFrom("ArtUserMetadata")
							.innerJoin(
								"User as LinkedUser",
								"LinkedUser.id",
								"ArtUserMetadata.userId",
							)
							.select((linkedEb) =>
								commonUserSelect(linkedEb, { alias: "LinkedUser" }),
							)
							.whereRef("ArtUserMetadata.artId", "=", "Art.id"),
					).as("linkedUsers"),
				])
				.where("Art.authorId", "=", userId)
				.execute()
		: [];

	const combined = [
		...taggedButNotAuthored.map((row) => ({
			id: row.id,
			url: row.url,
			description: row.description ?? undefined,
			createdAt: row.createdAt,
			isShowcase: Boolean(row.isShowcase),
			tags: row.tags.length > 0 ? row.tags : undefined,
			linkedUsers: row.linkedUsers.length > 0 ? row.linkedUsers : undefined,
			author: {
				discordId: row.discordId,
				username: row.username,
				discordAvatar: row.discordAvatar,
				customAvatarUrl: row.customAvatarUrl,
				commissionsOpen: row.commissionsOpen,
			},
			permissions: artPermissions({
				authorId: row.userId,
				linkedUsers: row.linkedUsers,
			}),
		})),
		...authored.map((row) => ({
			id: row.id,
			url: row.url,
			description: row.description ?? undefined,
			createdAt: row.createdAt,
			isShowcase: Boolean(row.isShowcase),
			tags: row.tags.length > 0 ? row.tags : undefined,
			linkedUsers: row.linkedUsers.length > 0 ? row.linkedUsers : undefined,
			author: undefined,
			permissions: artPermissions({
				authorId: userId,
				linkedUsers: row.linkedUsers,
			}),
		})),
	];

	return combined.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteById(id: number) {
	return db.deleteFrom("Art").where("id", "=", id).execute();
}

type TagsToAdd = Array<Partial<Pick<Tables["ArtTag"], "name" | "id">>>;

type InsertArtArgs = Pick<Tables["Art"], "description"> &
	Pick<Tables["UserSubmittedImage"], "url" | "validatedAt"> & {
		linkedUsers: number[];
		tags: TagsToAdd;
	};

export async function insert(args: InsertArtArgs) {
	const authorId = actorId();
	return await db.transaction().execute(async (trx) => {
		const img = await trx
			.insertInto("UnvalidatedUserSubmittedImage")
			.values({
				submitterUserId: authorId,
				url: args.url,
				validatedAt: args.validatedAt,
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		const hasExistingArt = await trx
			.selectFrom("Art")
			.select("id")
			.where("authorId", "=", authorId)
			.executeTakeFirst();

		const art = await trx
			.insertInto("Art")
			.values({
				authorId,
				description: args.description,
				imgId: img.id,
				isShowcase: hasExistingArt ? 0 : 1,
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		await trx
			.insertInto("ArtUserMetadata")
			.values(args.linkedUsers.map((userId) => ({ artId: art.id, userId })))
			.execute();

		await insertTags({ tags: args.tags, authorId, artId: art.id }, trx);

		return art;
	});
}

type UpdateArtArgs = Pick<Tables["Art"], "description" | "isShowcase"> & {
	linkedUsers: number[];
	tags: TagsToAdd;
};

export async function update(id: number, args: UpdateArtArgs) {
	return await db.transaction().execute(async (trx) => {
		const { authorId } = await trx
			.selectFrom("Art")
			.select("authorId")
			.where("id", "=", id)
			.executeTakeFirstOrThrow();

		if (args.isShowcase) {
			await trx
				.updateTable("Art")
				.set({ isShowcase: 0 })
				.where("authorId", "=", authorId)
				.execute();
		}

		await trx
			.updateTable("Art")
			.set({
				description: args.description,
				isShowcase: args.isShowcase ? 1 : 0,
			})
			.where("id", "=", id)
			.execute();

		await trx.deleteFrom("ArtUserMetadata").where("artId", "=", id).execute();

		await trx
			.insertInto("ArtUserMetadata")
			.values(args.linkedUsers.map((userId) => ({ artId: id, userId })))
			.execute();

		await trx.deleteFrom("TaggedArt").where("artId", "=", id).execute();

		await insertTags({ tags: args.tags, authorId, artId: id }, trx);

		return id;
	});
}

async function insertTags(
	{
		tags,
		authorId,
		artId,
	}: {
		tags: TagsToAdd;
		authorId: number;
		artId: number;
	},
	trx: Transaction<DB>,
) {
	const newTagNames = tags
		.filter((tag) => !tag.id)
		.map((tag) => {
			if (!tag.name) {
				throw new Error("tag name must be provided if no id");
			}
			return tag.name;
		});

	const newTagIds = (
		await trx
			.insertInto("ArtTag")
			.values(newTagNames.map((name) => ({ name, authorId })))
			.returning("ArtTag.id")
			.execute()
	).map((tag) => tag.id);

	const tagIds = [
		...tags.flatMap((tag) => (tag.id ? [tag.id] : [])),
		...newTagIds,
	];

	await trx
		.insertInto("TaggedArt")
		.values(tagIds.map((tagId) => ({ artId, tagId })))
		.execute();
}

function linkedUsersSubquery(eb: ExpressionBuilder<DB, "Art">) {
	return jsonArrayFrom(
		eb
			.selectFrom("ArtUserMetadata")
			.select("ArtUserMetadata.userId as id")
			.whereRef("ArtUserMetadata.artId", "=", "Art.id"),
	);
}

function artPermissions({
	authorId,
	linkedUsers,
}: {
	authorId: number;
	linkedUsers: Array<{ id: number }>;
}): ListedArt["permissions"] {
	return {
		EDIT: [authorId],
		UNLINK: linkedUsers.map((linkedUser) => linkedUser.id),
	};
}
