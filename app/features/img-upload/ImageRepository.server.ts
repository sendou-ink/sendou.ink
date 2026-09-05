import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";
import { IMAGES_TO_VALIDATE_AT_ONCE } from "./upload-constants";

/** Unvalidated image with its calendar event data. */
export function findById(id: number) {
	return db
		.selectFrom("UnvalidatedUserSubmittedImage")
		.leftJoin(
			"CalendarEvent",
			"CalendarEvent.avatarImgId",
			"UnvalidatedUserSubmittedImage.id",
		)
		.select(["CalendarEvent.tournamentId"])
		.where("UnvalidatedUserSubmittedImage.id", "=", id)
		.executeTakeFirst();
}

/** Deletes an image and its art entry. */
export function deleteById(id: number) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("Art").where("Art.imgId", "=", id).execute();
		await trx
			.deleteFrom("UnvalidatedUserSubmittedImage")
			.where("id", "=", id)
			.execute();
	});
}

/** Count of the author's unvalidated art images. */
export async function countUnvalidatedArt(authorId: number) {
	const result = await db
		.selectFrom("UnvalidatedUserSubmittedImage")
		.innerJoin("Art", "Art.imgId", "UnvalidatedUserSubmittedImage.id")
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.where("UnvalidatedUserSubmittedImage.validatedAt", "is", null)
		.where("Art.authorId", "=", authorId)
		.executeTakeFirstOrThrow();
	return result.count;
}

const unvalidatedImagesBaseQuery = db
	.selectFrom("UnvalidatedUserSubmittedImage")
	.where("UnvalidatedUserSubmittedImage.validatedAt", "is", null)
	.where((eb) =>
		eb.or([
			eb.exists(
				eb
					.selectFrom("Team")
					.select("Team.id")
					.where((innerEb) =>
						innerEb.or([
							innerEb(
								"Team.avatarImgId",
								"=",
								innerEb.ref("UnvalidatedUserSubmittedImage.id"),
							),
							innerEb(
								"Team.bannerImgId",
								"=",
								innerEb.ref("UnvalidatedUserSubmittedImage.id"),
							),
						]),
					),
			),
			eb.exists(
				eb
					.selectFrom("Art")
					.select("Art.id")
					.whereRef("Art.imgId", "=", "UnvalidatedUserSubmittedImage.id"),
			),
			eb.exists(
				eb
					.selectFrom("CalendarEvent")
					.select("CalendarEvent.id")
					.whereRef(
						"CalendarEvent.avatarImgId",
						"=",
						"UnvalidatedUserSubmittedImage.id",
					),
			),
		]),
	);

/** Count of unvalidated images used in teams, art or calendar events. */
export async function countAllUnvalidated() {
	const result = await unvalidatedImagesBaseQuery
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();
	return result.count;
}

/** Unvalidated images for admin review, with submitter info. */
export function findAllUnvalidated() {
	return unvalidatedImagesBaseQuery
		.leftJoin(
			"User",
			"UnvalidatedUserSubmittedImage.submitterUserId",
			"User.id",
		)
		.select((eb) => [
			"UnvalidatedUserSubmittedImage.id",
			concatUserSubmittedImagePrefix(
				eb.ref("UnvalidatedUserSubmittedImage.url"),
			).as("url"),
			"UnvalidatedUserSubmittedImage.submitterUserId",
			"User.username",
		])
		.limit(IMAGES_TO_VALIDATE_AT_ONCE)
		.execute();
}

/** Count of the user's unvalidated images connected to a team, art or event (orphans excluded); gates `image()` uploads. */
export async function countUnvalidatedBySubmitterUserId(userId: number) {
	const result = await unvalidatedImagesBaseQuery
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.where("UnvalidatedUserSubmittedImage.submitterUserId", "=", userId)
		.executeTakeFirstOrThrow();
	return result.count;
}

/** Marks an image as validated. */
export function validateById(id: number) {
	return db
		.updateTable("UnvalidatedUserSubmittedImage")
		.set({ validatedAt: databaseTimestampNow() })
		.where("id", "=", id)
		.execute();
}

/** Inserts an unvalidated image row without an owner. Returns the inserted row. */
export function insert(
	args: TablesInsertable["UnvalidatedUserSubmittedImage"],
	trx?: Transaction<DB>,
) {
	const executor = trx ?? db;

	return executor
		.insertInto("UnvalidatedUserSubmittedImage")
		.values(args)
		.returningAll()
		.executeTakeFirstOrThrow();
}
