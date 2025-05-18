import { db } from "~/db/sql";

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
