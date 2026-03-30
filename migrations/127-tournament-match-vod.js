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
        "vodId" text not null,
        "timestampSeconds" integer not null,
        "viewCount" integer not null
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index "tournament_match_vod_match_id" on "TournamentMatchVod"("matchId")`,
		).run();
	})();
}
