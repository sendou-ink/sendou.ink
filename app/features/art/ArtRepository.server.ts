import { type ExpressionBuilder, sql, type Transaction } from "kysely";
import { crud } from "~/db/crud";
import { defineQuery, mapRows, refine, sortedBy } from "~/db/entity-query";
import { db } from "~/db/sql";
import type { DB, Tables } from "~/db/tables";
import { actorId } from "~/features/auth/core/user.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import { invariant } from "~/utils/invariant";
import {
	commonUserSelect,
	concatUserSubmittedImagePrefix,
	jsonArrayFrom,
} from "~/utils/kysely.server";
import type { ArtSource } from "./art-types";

const artTable = crud("Art");
const imageTable = crud("UnvalidatedUserSubmittedImage");
const linkedUserTable = crud("ArtUserMetadata");
const tagTable = crud("ArtTag");
const taggedArtTable = crud("TaggedArt");

export const { deleteById } = artTable;

/**
 * Art with its image's `url`, newest first. Art whose image awaits validation is hidden unless a step lifts the guard:
 * `awaitingValidation`.
 */
export const arts = defineQuery({
	root: "Art",
	select: (qb) =>
		qb.select((eb) => [
			"Art.id",
			"Art.authorId",
			"Art.description",
			"Art.createdAt",
			concatUserSubmittedImagePrefix(
				eb
					.selectFrom("UnvalidatedUserSubmittedImage")
					.select("UnvalidatedUserSubmittedImage.url")
					.whereRef("UnvalidatedUserSubmittedImage.id", "=", "Art.imgId")
					.$asScalar()
					.$notNull(),
			).as("url"),
		]),
	defaultSort: [["Art.createdAt", "desc"]],
	guards: {
		unvalidated: (qb) => qb.where((eb) => imageValidated(eb, true)),
	},
	vocabulary: ({ lift }) => ({
		/** Only art whose image awaits validation. */
		awaitingValidation: () =>
			lift("unvalidated", (qb) => qb.where((eb) => imageValidated(eb, false))),
		/** The author with whether their commissions are open. */
		withAuthor: () =>
			UserRepository.withUser("author", "Art.authorId", ["commissionsOpen"]),
		withTags: () =>
			refine("Art", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("TaggedArt")
							.innerJoin("ArtTag", "ArtTag.id", "TaggedArt.tagId")
							.select(["ArtTag.id", "ArtTag.name"])
							.whereRef("TaggedArt.artId", "=", "Art.id"),
					).as("tags"),
				),
			),
		/** The users tagged in the art. */
		withLinkedUsers: () =>
			refine("Art", (qb) =>
				qb.select((eb) =>
					jsonArrayFrom(
						eb
							.selectFrom("ArtUserMetadata")
							.innerJoin("User", "User.id", "ArtUserMetadata.userId")
							.select((linkedEb) => commonUserSelect(linkedEb))
							.whereRef("ArtUserMetadata.artId", "=", "Art.id"),
					).as("linkedUsers"),
				),
			),
		/** The author may edit the art and the tagged users unlink themselves from it. */
		withPermissions: () =>
			mapRows(
				"Art",
				(row: { authorId: number; linkedUsers: Array<{ id: number }> }) => ({
					permissions: {
						EDIT: [row.authorId],
						UNLINK: row.linkedUsers.map((user) => user.id),
					},
				}),
			),
		/** Art the user made (`MADE-BY`), is tagged in without having made it (`MADE-OF`) or either (`ALL`). */
		involvingUser: (userId: number, source: ArtSource = "ALL") =>
			refine("Art", (qb) =>
				qb.where((eb) => {
					const madeBy = eb("Art.authorId", "=", userId);
					const taggedIn = eb(
						"Art.id",
						"in",
						eb
							.selectFrom("ArtUserMetadata")
							.select("ArtUserMetadata.artId")
							.where("ArtUserMetadata.userId", "=", userId),
					);

					switch (source) {
						case "ALL":
							return eb.or([madeBy, taggedIn]);
						case "MADE-BY":
							return madeBy;
						case "MADE-OF":
							return eb.and([eb("Art.authorId", "!=", userId), taggedIn]);
					}
				}),
			),
		/** Each author's showcase art, or their newest when none is. With `tagId`, picked among the author's art with the tag. */
		bestOfEachAuthor: (tagId: number | null = null) =>
			refine("Art", (qb) =>
				qb.where("Art.id", "in", (eb) =>
					eb
						.selectFrom((innerEb) =>
							innerEb
								// each author's most recent art (showcase first) via SQLite's max() + bare column rule,
								// packed into one integer since createdAt always stays below the isShowcase component
								.selectFrom("Art")
								.innerJoin(
									"UserSubmittedImage",
									"UserSubmittedImage.id",
									"Art.imgId",
								)
								.$if(tagId !== null, (taggedQb) =>
									taggedQb
										.innerJoin("TaggedArt", "TaggedArt.artId", "Art.id")
										.where("TaggedArt.tagId", "=", tagId!),
								)
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
						.select("BestOfAuthor.artId"),
				),
			),
		showcaseFirst: () =>
			sortedBy("Art", ["Art.isShowcase", "desc"], ["Art.createdAt", "desc"]),
	}),
});

export const tags = defineQuery({
	root: "ArtTag",
	select: (qb) => qb.select(["ArtTag.id", "ArtTag.name"]),
});

/** Removes the actor from the users tagged in the art. */
export function unlinkOwnFromArt(artId: number) {
	return linkedUserTable.delete({ artId, userId: actorId() });
}

/** Deletes tags no art has anymore, returning how many were deleted. */
export async function deleteOrphanTags() {
	const result = await db
		.deleteFrom("ArtTag")
		.where("ArtTag.id", "not in", (eb) =>
			eb.selectFrom("TaggedArt").select("TaggedArt.tagId"),
		)
		.executeTakeFirst();

	return Number(result.numDeletedRows);
}

type TagsToAdd = Array<Partial<Pick<Tables["ArtTag"], "name" | "id">>>;

type InsertArtArgs = Pick<Tables["Art"], "description"> &
	Pick<Tables["UserSubmittedImage"], "url" | "validatedAt"> & {
		linkedUsers: number[];
		tags: TagsToAdd;
	};

/**
 * Inserts the actor's art with its image, tagged users and tags, returning the ids of the art and
 * its image. The author's first art is their showcase.
 */
export function insert(args: InsertArtArgs) {
	const authorId = actorId();

	return db.transaction().execute(async (trx) => {
		const image = await imageTable.insert(
			{
				submitterUserId: authorId,
				url: args.url,
				validatedAt: args.validatedAt,
			},
			trx,
		);

		const hasExistingArt = await artTable.exists({ authorId }, trx);

		const art = await artTable.insert(
			{
				authorId,
				description: args.description,
				imgId: image.id,
				isShowcase: hasExistingArt ? 0 : 1,
			},
			trx,
		);

		await linkedUserTable.insertMany(
			args.linkedUsers.map((userId) => ({ artId: art.id, userId })),
			trx,
		);
		await insertTags({ tagsToAdd: args.tags, authorId, artId: art.id }, trx);

		return { id: art.id, imgId: image.id };
	});
}

type UpdateArtArgs = Pick<Tables["Art"], "description" | "isShowcase"> & {
	linkedUsers: number[];
	tags: TagsToAdd;
};

/** Updates the art and replaces its tagged users and tags. Making it the showcase unsets the author's previous one. */
export function update(id: number, args: UpdateArtArgs) {
	return db.transaction().execute(async (trx) => {
		const art = await artTable.findById(id, trx);
		invariant(art, "Art to update not found");

		if (args.isShowcase) {
			await artTable.update({ authorId: art.authorId }, { isShowcase: 0 }, trx);
		}

		await artTable.updateById(
			id,
			{ description: args.description, isShowcase: args.isShowcase },
			trx,
		);

		await linkedUserTable.delete({ artId: id }, trx);
		await linkedUserTable.insertMany(
			args.linkedUsers.map((userId) => ({ artId: id, userId })),
			trx,
		);

		await taggedArtTable.delete({ artId: id }, trx);
		await insertTags(
			{ tagsToAdd: args.tags, authorId: art.authorId, artId: id },
			trx,
		);

		return id;
	});
}

async function insertTags(
	{
		tagsToAdd,
		authorId,
		artId,
	}: {
		tagsToAdd: TagsToAdd;
		authorId: number;
		artId: number;
	},
	trx: Transaction<DB>,
) {
	const newTagNames = tagsToAdd
		.filter((tag) => !tag.id)
		.map((tag) => {
			if (!tag.name) {
				throw new Error("tag name must be provided if no id");
			}
			return tag.name;
		});

	const newTags = await tagTable.insertMany(
		newTagNames.map((name) => ({ name, authorId })),
		trx,
	);

	const tagIds = [
		...tagsToAdd.flatMap((tag) => (tag.id ? [tag.id] : [])),
		...newTags.map((tag) => tag.id),
	];

	await taggedArtTable.insertMany(
		tagIds.map((tagId) => ({ artId, tagId })),
		trx,
	);
}

function imageValidated(eb: ExpressionBuilder<DB, "Art">, validated: boolean) {
	return eb.exists(
		eb
			.selectFrom("UnvalidatedUserSubmittedImage")
			.select("UnvalidatedUserSubmittedImage.id")
			.whereRef("UnvalidatedUserSubmittedImage.id", "=", "Art.imgId")
			.where(
				"UnvalidatedUserSubmittedImage.validatedAt",
				validated ? "is not" : "is",
				null,
			),
	);
}
