export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "TournamentMatchVod" (
        "id" integer primary key autoincrement,
        "matchId" integer not null references "TournamentMatch"("id"),
        "userId" integer references "User"("id"),
        "platform" text not null,
        "account" text not null,
        "platformVideoId" text not null,
        "timestampSeconds" integer not null,
        "viewCount" integer not null
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create unique index "tournament_match_vod_match_id_account" on "TournamentMatchVod"("matchId", "account")`,
		).run();
	})();
}
