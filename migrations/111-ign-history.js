export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
			create table "UserInGameNameHistory" (
				"id" integer primary key,
				"userId" integer not null,
				"inGameName" text not null,
				"createdAt" integer default (strftime('%s', 'now')) not null,
				foreign key ("userId") references "User"("id") on delete cascade
			) strict
		`,
		).run();

		db.prepare(
			/* sql */ `create index user_ign_history_user_id on "UserInGameNameHistory"("userId")`,
		).run();

		db.prepare(
			/* sql */ `
			create trigger track_ign_on_update
			after update on "User"
			for each row
			when new."inGameName" is not null
				and (old."inGameName" is null or new."inGameName" != old."inGameName")
			begin
				insert into "UserInGameNameHistory" ("userId", "inGameName")
				values (new."id", new."inGameName");
			end
		`,
		).run();
	})();
}
