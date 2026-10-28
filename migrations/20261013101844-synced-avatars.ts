import { type Kysely, sql } from "kysely";

/**
 * The avatar copied from the account the user logs in with is stored as an image like a custom
 * avatar. Art tag notifications refer to the adder by user id instead of Discord id.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("User")
			.addColumn("syncedAvatarImgId", "integer", (col) =>
				col.references("UnvalidatedUserSubmittedImage.id").onDelete("set null"),
			)
			.execute();
		await trx.schema
			.createIndex("user_synced_avatar_img_id")
			.on("User")
			.column("syncedAvatarImgId")
			.where("syncedAvatarImgId", "is not", null)
			.execute();

		await sql`
			update "Notification"
			set "meta" = json_set(
				json_remove("meta", '$.adderDiscordId'),
				'$.adderId',
				(select "User"."id" from "User" where "User"."discordId" = "Notification"."meta" ->> '$.adderDiscordId')
			)
			where "type" = 'TAGGED_TO_ART'
				and "meta" ->> '$.adderDiscordId' is not null
		`.execute(trx);
	});
}
