export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `
    create table "TournamentBracketProgressionOverride" (
      "sourceBracketIdx" integer not null,
      "destinationBracketIdx" integer not null,
      "tournamentTeamId" integer not null,
      "tournamentId" integer not null,
      unique("sourceBracketIdx", "tournamentTeamId") on conflict replace,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade
    ) strict
    `,
		).run();

		db.prepare(
			/*sql*/ `create index tournament_bracket_progression_override_tournament_id on "TournamentBracketProgressionOverride"("tournamentId")`,
		).run();
	})();
}
