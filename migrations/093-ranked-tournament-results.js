export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `alter table "TournamentResult" add "setResults" text not null default '[]'`,
		).run();
		db.prepare(
			/* sql */ `alter table "TournamentResult" add "spDiff" real`,
		).run();
		db.prepare(/* sql */ `alter table "Skill" add "createdAt" integer`).run();

		db.prepare(
			/*sql*/ `create index tournament_team_team_id on "TournamentTeam"("teamId")`,
		).run();
	})();
}
