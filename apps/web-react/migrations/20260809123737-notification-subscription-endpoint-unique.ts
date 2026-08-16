import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		// same browser subscribed multiple times; keep only the latest row per endpoint
		await sql`
			delete from "NotificationUserSubscription"
			where "id" not in (
				select max("id")
				from "NotificationUserSubscription"
				group by json_extract("subscription", '$.endpoint')
			)
		`.execute(trx);

		await sql`
			create unique index "notification_user_subscription_endpoint"
			on "NotificationUserSubscription" (json_extract("subscription", '$.endpoint'))
		`.execute(trx);
	});
}
