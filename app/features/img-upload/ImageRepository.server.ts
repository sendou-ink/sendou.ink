import { db } from "~/db/sql";

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

export function deleteImageById(id: number) {
	return db.transaction().execute(async (trx) => {
		await trx.deleteFrom("Art").where("Art.imgId", "=", id).execute();
		await trx
			.deleteFrom("UnvalidatedUserSubmittedImage")
			.where("id", "=", id)
			.execute();
	});
}
