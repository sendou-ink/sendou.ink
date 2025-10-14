export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `create index idx_tmgrp_tournament_team_id on "TournamentMatchGameResultParticipant"("tournamentTeamId")`,
		).run();
	})();
}
