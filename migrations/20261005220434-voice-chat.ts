import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.createTable("VoiceSession")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("roomId", "integer", (col) =>
				col.references("ChatRoom.id").onDelete("set null"),
			)
			.addColumn("roomType", "text", (col) => col.notNull())
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("platform", "text", (col) => col.notNull())
			.addColumn("eligibleMemberCount", "integer", (col) => col.notNull())
			.addColumn("dailySessionId", "text")
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.addColumn("connectedAt", "integer")
			.addColumn("leftAt", "integer")
			.addColumn("durationSeconds", "integer")
			.addColumn("leaveReason", "text")
			.addColumn("networkQualityState", "text")
			.addColumn("lowQualitySeconds", "integer", (col) =>
				col.notNull().defaultTo(0),
			)
			.addColumn("talkSeconds", "integer", (col) => col.notNull().defaultTo(0))
			.addColumn("inputMode", "text")
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("voice_session_created_at")
			.on("VoiceSession")
			.column("createdAt")
			.execute();

		await trx.schema
			.createIndex("voice_session_room_id_user_id")
			.on("VoiceSession")
			.columns(["roomId", "userId"])
			.execute();

		await trx.schema
			.createIndex("voice_session_user_id")
			.on("VoiceSession")
			.column("userId")
			.execute();

		await trx.schema
			.createIndex("voice_session_daily_session_id")
			.on("VoiceSession")
			.column("dailySessionId")
			.unique()
			.execute();

		await trx.schema
			.createTable("VoiceClientError")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("voiceSessionId", "integer", (col) =>
				col.references("VoiceSession.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("kind", "text", (col) => col.notNull())
			.addColumn("detail", "text")
			.addColumn("platform", "text", (col) => col.notNull())
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("voice_client_error_created_at")
			.on("VoiceClientError")
			.column("createdAt")
			.execute();

		await trx.schema
			.createIndex("voice_client_error_voice_session_id")
			.on("VoiceClientError")
			.column("voiceSessionId")
			.execute();

		await trx.schema
			.createIndex("voice_client_error_user_id")
			.on("VoiceClientError")
			.column("userId")
			.execute();

		await trx.schema
			.createTable("VoiceFeedback")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("voiceSessionId", "integer", (col) =>
				col.notNull().references("VoiceSession.id").onDelete("cascade"),
			)
			.addColumn("userId", "integer", (col) =>
				col.notNull().references("User.id").onDelete("cascade"),
			)
			.addColumn("rating", "integer", (col) => col.notNull())
			.addColumn("comment", "text")
			.addColumn("createdAt", "integer", (col) =>
				col.notNull().defaultTo(sql`(strftime('%s', 'now'))`),
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("voice_feedback_voice_session_id")
			.on("VoiceFeedback")
			.column("voiceSessionId")
			.unique()
			.execute();

		await trx.schema
			.createIndex("voice_feedback_user_id_created_at")
			.on("VoiceFeedback")
			.columns(["userId", "createdAt"])
			.execute();

		await trx.schema
			.createIndex("voice_feedback_created_at")
			.on("VoiceFeedback")
			.column("createdAt")
			.execute();

		await trx.schema
			.createTable("VoiceSettings")
			.addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
			.addColumn("isDisabled", "integer", (col) => col.notNull().defaultTo(0))
			.addColumn("updatedAt", "integer")
			.addColumn("updatedByUserId", "integer", (col) =>
				col.references("User.id").onDelete("set null"),
			)
			.modifyEnd(sql`strict`)
			.execute();

		await trx.schema
			.createIndex("voice_settings_updated_by_user_id")
			.on("VoiceSettings")
			.column("updatedByUserId")
			.execute();

		await trx.insertInto("VoiceSettings").values({ isDisabled: 0 }).execute();
	});
}
