import type { Transaction } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/sqlite";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";
import { seededRandom } from "~/utils/random";
import type { ListedArt } from "./art-types";

export function unlinkUserFromArt({
	userId,
	artId,
}: {
	userId: number;
	artId: number;
}) {
	return db
		.deleteFrom("ArtUserMetadata")
		.where("artId", "=", artId)
		.where("userId", "=", userId)
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
		.selectFrom("Art")
		.innerJoin("User", "User.id", "Art.authorId")
		.innerJoin("UserSubmittedImage", "UserSubmittedImage.id", "Art.imgId")
		.select((eb) => [
			"Art.id",
			"Art.createdAt",
			"Art.isShowcase",
			"User.id as userId",
			"User.discordId",
			"User.username",
			"User.discordAvatar",
			"User.commissionsOpen",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"url",
			),
		])
		.orderBy("Art.isShowcase", "desc")
		.orderBy("Art.createdAt", "desc")
		.orderBy("User.id", "asc")
		.execute();

	const encounteredUserIds = new Set<number>();

	const mappedArts = arts
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
				discordId: a.discordId,
				username: a.username,
			},
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
			"User.id as userId",
			"User.discordId",
			"User.username",
			"User.discordAvatar",
			"User.commissionsOpen",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"url",
			),
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
				discordId: a.discordId,
				username: a.username,
			},
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
			"User.discordId",
			"User.username",
			"User.discordAvatar",
			"User.commissionsOpen",
			concatUserSubmittedImagePrefix(eb.ref("UserSubmittedImage.url")).as(
				"url",
			),
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
			discordId: a.discordId,
			username: a.username,
		},
	}));
}

export async function findAllTags() {
	return db.selectFrom("ArtTag").select(["id", "name"]).execute();
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
					"User.discordId",
					"User.username",
					"User.discordAvatar",
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
							.select([
								"LinkedUser.id",
								"LinkedUser.discordId",
								"LinkedUser.username",
								"LinkedUser.customUrl",
							])
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
							.select([
								"LinkedUser.id",
								"LinkedUser.discordId",
								"LinkedUser.username",
								"LinkedUser.customUrl",
							])
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
				commissionsOpen: row.commissionsOpen ?? undefined,
			},
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
		})),
	];

	return combined.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteById(id: number) {
	return db.deleteFrom("Art").where("id", "=", id).execute();
}

type TagsToAdd = Array<Partial<Pick<Tables["ArtTag"], "name" | "id">>>;

type InsertArtArgs = Pick<Tables["Art"], "authorId" | "description"> &
	Pick<Tables["UserSubmittedImage"], "url" | "validatedAt"> & {
		linkedUsers: number[];
		tags: TagsToAdd;
	};

export async function insert(args: InsertArtArgs) {
	return await db.transaction().execute(async (trx) => {
		const img = await trx
			.insertInto("UnvalidatedUserSubmittedImage")
			.values({
				submitterUserId: args.authorId,
				url: args.url,
				validatedAt: args.validatedAt,
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		const hasExistingArt = await trx
			.selectFrom("Art")
			.select("id")
			.where("authorId", "=", args.authorId)
			.executeTakeFirst();

		const art = await trx
			.insertInto("Art")
			.values({
				authorId: args.authorId,
				description: args.description,
				imgId: img.id,
				isShowcase: hasExistingArt ? 0 : 1,
			})
			.returningAll()
			.executeTakeFirstOrThrow();

		if (args.linkedUsers.length > 0) {
			await trx
				.insertInto("ArtUserMetadata")
				.values(args.linkedUsers.map((userId) => ({ artId: art.id, userId })))
				.execute();
		}

		await insertTags(trx, {
			tags: args.tags,
			authorId: args.authorId,
			artId: art.id,
		});

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

		if (args.linkedUsers.length > 0) {
			await trx
				.insertInto("ArtUserMetadata")
				.values(args.linkedUsers.map((userId) => ({ artId: id, userId })))
				.execute();
		}

		await trx.deleteFrom("TaggedArt").where("artId", "=", id).execute();

		await insertTags(trx, {
			tags: args.tags,
			authorId,
			artId: id,
		});

		return id;
	});
}

async function insertTags(
	trx: Transaction<DB>,
	{
		tags,
		authorId,
		artId,
	}: {
		tags: TagsToAdd;
		authorId: number;
		artId: number;
	},
) {
	for (const tag of tags) {
		let tagId = tag.id;
		if (!tagId) {
			if (!tag.name) {
				throw new Error("tag name must be provided if no id");
			}

			const newTag = await trx
				.insertInto("ArtTag")
				.values({
					name: tag.name,
					authorId,
				})
				.returningAll()
				.executeTakeFirstOrThrow();
			tagId = newTag.id;
		}

		await trx.insertInto("TaggedArt").values({ artId, tagId }).execute();
	}
}
