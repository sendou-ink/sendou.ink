export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `
			delete from "TournamentTeamCheckIn"
			where "rowid" not in (
				select max("rowid")
				from "TournamentTeamCheckIn"
				group by "tournamentTeamId", coalesce("bracketIdx", -1)
			)`,
		).run();

		db.prepare(
			/* sql */ `
			create unique index "tournament_team_check_in_team_bracket_unique"
			on "TournamentTeamCheckIn"("tournamentTeamId", coalesce("bracketIdx", -1))`,
		).run();
	})();
}
