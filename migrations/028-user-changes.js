export function up(db) {
	db.prepare(/* sql */ `alter table "User" add "discordUniqueName" text`).run();
	db.prepare(
		/* sql */ `alter table "User" add "showDiscordUniqueName" integer not null default 1`,
	).run();
	db.prepare(
		/* sql */ `alter table "UserWeapon" add "isFavorite" integer not null default 0`,
	).run();
}
