export function up(db) {
	db.prepare(
		/*sql*/ `
    create table "TournamentSub" (
      "userId" integer not null,
      "tournamentId" integer not null,
      "canVc" integer not null,
      "bestWeapons" text not null,
      "okWeapons" text,
      "message" text,
      "visibility" text not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
      unique("userId", "tournamentId") on conflict rollback
    ) strict
  `,
	).run();
}
