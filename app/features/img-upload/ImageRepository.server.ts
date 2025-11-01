import { db } from "~/db/sql";
import { databaseTimestampNow } from "~/utils/dates";
import { IMAGES_TO_VALIDATE_AT_ONCE } from "./upload-constants";
import type { ImageUploadType } from "./upload-types";

// xxx: unit tests

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

/** Counts all unvalidated images used in teams, art, or calendar events */
export async function countAllUnvalidated() {
	const result = await db
		.selectFrom("UnvalidatedUserSubmittedImage")
		.leftJoin("AllTeam", (join) =>
			join.on((eb) =>
				eb.or([
					eb(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						eb.ref("AllTeam.avatarImgId"),
					),
					eb(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						eb.ref("AllTeam.bannerImgId"),
					),
				]),
			),
		)
		.leftJoin("Art", "UnvalidatedUserSubmittedImage.id", "Art.imgId")
		.leftJoin(
			"CalendarEvent",
			"UnvalidatedUserSubmittedImage.id",
			"CalendarEvent.avatarImgId",
		)
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.where("UnvalidatedUserSubmittedImage.validatedAt", "is", null)
		.where((eb) =>
			eb.or([
				eb("AllTeam.id", "is not", null),
				eb("Art.id", "is not", null),
				eb("CalendarEvent.id", "is not", null),
			]),
		)
		.executeTakeFirstOrThrow();
	return result.count;
}

/** Counts unvalidated team images submitted by a specific user */
export async function countUnvalidatedBySubmitterUserId(userId: number) {
	const result = await db
		.selectFrom("UnvalidatedUserSubmittedImage")
		.innerJoin("AllTeam", (join) =>
			join.on((eb) =>
				eb.or([
					eb(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						eb.ref("AllTeam.avatarImgId"),
					),
					eb(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						eb.ref("AllTeam.bannerImgId"),
					),
				]),
			),
		)
		.select(({ fn }) => fn.countAll<number>().as("count"))
		.where("UnvalidatedUserSubmittedImage.validatedAt", "is", null)
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

/** Fetches unvalidated images for admin review with submitter info */
export function unvalidatedImages() {
	return db
		.selectFrom("UnvalidatedUserSubmittedImage")
		.leftJoin(
			"User",
			"UnvalidatedUserSubmittedImage.submitterUserId",
			"User.id",
		)
		.leftJoin("AllTeam", (join) =>
			join.on((eb) =>
				eb.or([
					eb(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						eb.ref("AllTeam.avatarImgId"),
					),
					eb(
						"UnvalidatedUserSubmittedImage.id",
						"=",
						eb.ref("AllTeam.bannerImgId"),
					),
				]),
			),
		)
		.leftJoin("Art", "UnvalidatedUserSubmittedImage.id", "Art.imgId")
		.leftJoin(
			"CalendarEvent",
			"UnvalidatedUserSubmittedImage.id",
			"CalendarEvent.avatarImgId",
		)
		.select([
			"UnvalidatedUserSubmittedImage.id",
			"UnvalidatedUserSubmittedImage.url",
			"UnvalidatedUserSubmittedImage.submitterUserId",
			"User.username",
		])
		.where("UnvalidatedUserSubmittedImage.validatedAt", "is", null)
		.where((eb) =>
			eb.or([
				eb("AllTeam.id", "is not", null),
				eb("Art.id", "is not", null),
				eb("CalendarEvent.id", "is not", null),
			]),
		)
		.limit(IMAGES_TO_VALIDATE_AT_ONCE)
		.execute();
}

/** Creates a new image and associates it with a team or organization */
export function addNewImage({
	submitterUserId,
	url,
	validatedAt,
	teamId,
	organizationId,
	type,
}: {
	submitterUserId: number;
	url: string;
	validatedAt: number | null;
	teamId?: number;
	organizationId?: number;
	type: ImageUploadType;
}) {
	return db.transaction().execute(async (trx) => {
		const img = await trx
			.insertInto("UnvalidatedUserSubmittedImage")
			.values({ submitterUserId, url, validatedAt })
			.returningAll()
			.executeTakeFirstOrThrow();

		if (type === "team-pfp" && teamId) {
			await trx
				.updateTable("AllTeam")
				.set({ avatarImgId: img.id })
				.where("id", "=", teamId)
				.execute();
		} else if (type === "team-banner" && teamId) {
			await trx
				.updateTable("AllTeam")
				.set({ bannerImgId: img.id })
				.where("id", "=", teamId)
				.execute();
		} else if (type === "org-pfp" && organizationId) {
			await trx
				.updateTable("TournamentOrganization")
				.set({ avatarImgId: img.id })
				.where("id", "=", organizationId)
				.execute();
		}

		return img;
	});
}
