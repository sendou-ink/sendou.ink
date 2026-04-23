export function up(db) {
	db.prepare(
		/* sql */ `alter table "TournamentTeam" add column "abDivision" integer`,
	).run();
}
