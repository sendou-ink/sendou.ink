export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "TournamentStreamer" (
        "id" integer primary key autoincrement,
        "userId" integer,
        "tournamentId" integer not null,
        "twitchAccount" text not null,
        unique("twitchAccount", "tournamentId") on conflict ignore
      ) strict
    `,
		).run();

		const rows = db
			.prepare(
				/*sql*/ `select "id", "castedMatchesInfo" from "Tournament" where "castedMatchesInfo" is not null`,
			)
			.all();

		for (const row of rows) {
			const info = JSON.parse(row.castedMatchesInfo);
			info.lockedMatches = [];
			db.prepare(
				/*sql*/ `update "Tournament" set "castedMatchesInfo" = ? where "id" = ?`,
			).run(JSON.stringify(info), row.id);
		}
	})();
}
