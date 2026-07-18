import type { Transaction } from "kysely";
import { db } from "~/db/sql";
import type { DB, TablesInsertable } from "~/db/tables";
import { databaseTimestampNow } from "~/utils/dates";
import { concatUserSubmittedImagePrefix } from "~/utils/kysely.server";
import { IMAGES_TO_VALIDATE_AT_ONCE } from "./upload-constants";

/** Finds an unvalidated image by ID with associated calendar event data */
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

/** Deletes an image and its associated art entry in a transaction */
export function deleteImageById(id: number) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("Art").where("Art.imgId", "=", id).execute();
		await trx
			.deleteFrom("UnvalidatedUserSubmittedImage")
			.where("id", "=", id)
			.execute();
	});
}

/** Counts unvalidated art images for a specific author */
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

/** Counts all unvalidated images used in teams, art, or calendar events */
export async function countAllUnvalidated() {
	const result = await unvalidatedImagesBaseQuery
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.executeTakeFirstOrThrow();
	return result.count;
}

/** Fetches unvalidated images for admin review with submitter info */
export function unvalidatedImages() {
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

/**
 * Counts unvalidated images submitted by a user that are connected to a team, art, or calendar
 * event (i.e. excluding not-yet-connected orphans), so it can gate the SendouForm `image()` upload
 * path.
 */
export async function countUnvalidatedBySubmitterUserId(userId: number) {
	const result = await unvalidatedImagesBaseQuery
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.where("UnvalidatedUserSubmittedImage.submitterUserId", "=", userId)
		.executeTakeFirstOrThrow();
	return result.count;
}

/** Marks an image as validated by setting the current timestamp */
export function validateImage(id: number) {
	return db
		.updateTable("UnvalidatedUserSubmittedImage")
		.set({ validatedAt: databaseTimestampNow() })
		.where("id", "=", id)
		.execute();
}

/**
 * Inserts an unvalidated image row without associating it with any owner. Returns the inserted row.
 */
export function insert(
	args: TablesInsertable["UnvalidatedUserSubmittedImage"],
	trx: Transaction<DB> | typeof db = db,
) {
	return trx
		.insertInto("UnvalidatedUserSubmittedImage")
		.values(args)
		.returningAll()
		.executeTakeFirstOrThrow();
}
