export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "TournamentMatchPickBanEvent_new" (
        "type" text not null,
        "stageId" integer,
        "mode" text,
        "matchId" integer not null,
        "authorId" integer,
        "number" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("authorId") references "User"("id") on delete restrict,
        foreign key ("matchId") references "TournamentMatch"("id") on delete cascade,
        unique("matchId", "number") on conflict rollback
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `
      insert into "TournamentMatchPickBanEvent_new" ("type", "stageId", "mode", "matchId", "authorId", "number", "createdAt")
      select "type", "stageId", "mode", "matchId", "authorId", "number", "createdAt"
      from "TournamentMatchPickBanEvent"
    `,
		).run();

		db.prepare(/*sql*/ `drop table "TournamentMatchPickBanEvent"`).run();

		db.prepare(
			/*sql*/ `alter table "TournamentMatchPickBanEvent_new" rename to "TournamentMatchPickBanEvent"`,
		).run();

		db.prepare(
			/*sql*/ `create index pick_ban_event_author_id on "TournamentMatchPickBanEvent"("authorId")`,
		).run();
		db.prepare(
			/*sql*/ `create index pick_ban_event_match_id on "TournamentMatchPickBanEvent"("matchId")`,
		).run();
	})();
}
