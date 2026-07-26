const NULLABLE_BOOLEAN_COLUMNS = [
	{ table: "GroupLike", column: "isRechallenge" },
	{ table: "User", column: "isArtist" },
	{ table: "User", column: "isVideoAdder" },
	{ table: "User", column: "isTournamentOrganizer" },
	{ table: "User", column: "isApiAccesser" },
	{ table: "User", column: "commissionsOpen" },
];

export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `alter table "Build" add column "isPrivate" integer not null default 0`,
		).run();

		db.prepare(
			/*sql*/ `update "Build" set "isPrivate" = coalesce("private", 0)`,
		).run();

		db.prepare(/*sql*/ `alter table "Build" drop column "private"`).run();

		for (const { table, column } of NULLABLE_BOOLEAN_COLUMNS) {
			db.prepare(
				/*sql*/ `alter table "${table}" add column "${column}_new" integer not null default 0`,
			).run();

			db.prepare(
				/*sql*/ `update "${table}" set "${column}_new" = coalesce("${column}", 0)`,
			).run();

			db.prepare(
				/*sql*/ `alter table "${table}" drop column "${column}"`,
			).run();

			db.prepare(
				/*sql*/ `alter table "${table}" rename column "${column}_new" to "${column}"`,
			).run();
		}

		db.pragma("foreign_key_check");
	})();
}
