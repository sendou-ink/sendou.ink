export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
      create table "LFGPost" (
        "id" integer primary key,
        "type" text not null,
        "text" text not null,
        "timezone" text not null,
        "authorId" integer not null,
        "teamId" integer,
        "plusTierVisibility" integer,
        "updatedAt" integer default (strftime('%s', 'now')) not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        foreign key ("authorId") references "User"("id") on delete restrict,
        foreign key ("teamId") references "AllTeam"("id") on delete cascade,
        unique("authorId", "type") on conflict rollback
      ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index lfg_post_author_id on "LFGPost"("authorId")`,
		).run();
		db.prepare(
			/*sql*/ `create index lfg_post_team_id on "LFGPost"("teamId")`,
		).run();
	})();
}
