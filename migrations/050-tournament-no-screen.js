export function up(db) {
	db.prepare(
		/* sql */ `alter table "TournamentTeam" add "noScreen" integer not null default 0`,
	).run();
}
