export function up(db) {
	db.transaction(() => {
		db.prepare(/* sql */ `drop table if exists "TournamentSub"`).run();

		db.pragma("foreign_key_check");
	})();
}
