export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "TournamentMatchPickBanEvent" (
        "type" text not null,
        "stageId" integer not null,
        "mode" text not null,
        "matchId" integer not null,
        "authorId" integer not null,
        "number" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("authorId") references "User"("id") on delete restrict,
        foreign key ("matchId") references "TournamentMatch"("id") on delete cascade,
        unique("matchId", "number") on conflict rollback
      ) strict
    `,
		).run();

		db.prepare(
			/* sql */ `create index pick_ban_event_author_id on "TournamentMatchPickBanEvent"("authorId")`,
		).run();
		db.prepare(
			/* sql */ `create index pick_ban_event_match_id on "TournamentMatchPickBanEvent"("matchId")`,
		).run();

		db.prepare(/* sql */ `alter table "Tournament" add "rules" text`).run();
		db.prepare(
			/* sql */ `alter table "TournamentTeam" add "teamId" integer`,
		).run();
	})();
}
