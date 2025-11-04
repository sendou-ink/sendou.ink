export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `alter table "TournamentResult" add "div" text`).run();
	})();
}
