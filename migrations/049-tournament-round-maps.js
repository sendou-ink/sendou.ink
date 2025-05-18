export function up(db) {
	db.prepare(/* sql */ `alter table "TournamentRound" add "maps" text`).run();
}
