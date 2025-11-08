export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `create index idx_tournament_match_opponent_one_id on "TournamentMatch"("opponentOne" ->> '$.id')`,
		).run();

		db.prepare(
			/* sql */ `create index idx_tournament_match_opponent_two_id on "TournamentMatch"("opponentTwo" ->> '$.id')`,
		).run();
	})();
}
