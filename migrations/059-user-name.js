export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" add "customName" text`).run();
	})();

	db.prepare(
		/* sql */ `alter table "User" add "username" text generated always as (coalesce("customName", "discordName")) virtual`,
	).run();

	db.prepare(
		/* sql */ `alter table "User" drop column "discordDiscriminator"`,
	).run();
}
