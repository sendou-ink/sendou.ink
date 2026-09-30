import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	// the pickup logo lookup of every registration upsert scanned every team, and most teams have no logo
	await db.schema
		.createIndex("tournament_team_avatar_img_id")
		.on("TournamentTeam")
		.column("avatarImgId")
		.where("avatarImgId", "is not", null)
		.execute();
}
