import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await sql`
			create table "UserDiscordToken" (
				"userId" integer primary key,
				"accessToken" text not null,
				"refreshToken" text not null,
				"expiresAt" integer not null,
				foreign key ("userId") references "User"("id") on delete cascade
			) strict
		`.execute(trx);
	});
}
