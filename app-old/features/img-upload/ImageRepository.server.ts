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
