export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
      create table "SavedTournament" (
        "id" integer primary key,
        "userId" integer not null,
        "tournamentId" integer not null,
        "createdAt" integer default (strftime('%s', 'now')) not null,
        unique("userId", "tournamentId") on conflict rollback,
        foreign key ("userId") references "User"("id") on delete cascade,
        foreign key ("tournamentId") references "Tournament"("id") on delete cascade
      ) strict`,
		).run();

		db.prepare(
			`create index saved_tournament_user_id on "SavedTournament"("userId")`,
		).run();
		db.prepare(
			`create index saved_tournament_tournament_id on "SavedTournament"("tournamentId")`,
		).run();
	})();
}
