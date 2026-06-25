export function up(db) {
	db.transaction(() => {
		// trigram-tokenized full text search index over the columns user search
		// matches against, so substring (LIKE '%query%') searches can use an
		// index instead of scanning the whole User table.
		// external content table: rows are not stored twice, the index reads
		// from User and is kept in sync by the triggers below.
		db.prepare(
			/* sql */ `create virtual table "UserSearch" using fts5(
				"username",
				"inGameName",
				"discordUniqueName",
				"customUrl",
				content='User',
				content_rowid='id',
				tokenize='trigram'
			)`,
		).run();

		db.prepare(
			/* sql */ `insert into "UserSearch"("UserSearch") values ('rebuild')`,
		).run();

		db.prepare(
			/* sql */ `create trigger "user_search_after_insert" after insert on "User" begin
				insert into "UserSearch"(rowid, "username", "inGameName", "discordUniqueName", "customUrl")
				values (new."id", new."username", new."inGameName", new."discordUniqueName", new."customUrl");
			end`,
		).run();

		db.prepare(
			/* sql */ `create trigger "user_search_after_delete" after delete on "User" begin
				insert into "UserSearch"("UserSearch", rowid, "username", "inGameName", "discordUniqueName", "customUrl")
				values ('delete', old."id", old."username", old."inGameName", old."discordUniqueName", old."customUrl");
			end`,
		).run();

		// "username" is a generated column (coalesce of customName/discordName)
		// and generated columns can not be listed in "update of", so the
		// trigger watches its source columns instead
		db.prepare(
			/* sql */ `create trigger "user_search_after_update" after update of "customName", "discordName", "inGameName", "discordUniqueName", "customUrl" on "User" begin
				insert into "UserSearch"("UserSearch", rowid, "username", "inGameName", "discordUniqueName", "customUrl")
				values ('delete', old."id", old."username", old."inGameName", old."discordUniqueName", old."customUrl");
				insert into "UserSearch"(rowid, "username", "inGameName", "discordUniqueName", "customUrl")
				values (new."id", new."username", new."inGameName", new."discordUniqueName", new."customUrl");
			end`,
		).run();
	})();
}
