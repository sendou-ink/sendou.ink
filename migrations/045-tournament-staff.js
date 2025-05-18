export function up(db) {
	db.prepare(
		/*sql*/ `
    create table "TournamentStaff" (
      "tournamentId" integer not null,
      "userId" integer not null,
      "role" text not null,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("tournamentId", "userId") on conflict rollback
    ) strict
  `,
	).run();

	db.prepare(
		/* sql */ `alter table "Tournament" add "castTwitchAccounts" text`,
	).run();
}
