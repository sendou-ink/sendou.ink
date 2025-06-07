export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "User" add "createdAt" integer`).run();

		db.prepare(
			/* sql */ `alter table "Tournament" add "isFinalized" integer not null default 0`,
		).run();

		const finalizedTournamentIds = db
			.prepare(
				/* sql */ `select "tournamentId" from "TournamentResult" group by "tournamentId"`,
			)
			.all();

		const updateStatement = db.prepare(
			/* sql */ `update "Tournament" set isFinalized = 1 where id = @tournamentId`,
		);

		for (const tournamentId of finalizedTournamentIds) {
			updateStatement.run({
				tournamentId: tournamentId.tournamentId,
			});
		}
	})();
}
