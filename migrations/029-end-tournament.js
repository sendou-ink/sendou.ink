export function up(db) {
	db.prepare(
		`create index tournament_sub_user_id on "TournamentSub"("userId")`,
	).run();
	db.prepare(
		`create index tournament_sub_tournament_id on "TournamentSub"("tournamentId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "Skill" (
      "id" integer primary key,
      "mu" real not null,
      "sigma" real not null,
      "ordinal" real not null,
      "userId" integer,
      "identifier" text,
      "matchesCount" integer not null,
      "tournamentId" integer,
      foreign key ("userId") references "User"("id") on delete cascade,
      foreign key ("tournamentId") references "Tournament"("id") on delete restrict,
      unique("userId", "tournamentId") on conflict rollback 
    ) strict
  `,
	).run();

	db.prepare(`create index skill_user_id on "Skill"("userId")`).run();
	db.prepare(
		`create index skill_tournament_id on "Skill"("tournamentId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "SkillTeamUser" (
      "userId" integer not null,
      "skillId" integer not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      foreign key ("skillId") references "Skill"("id") on delete cascade,
      unique("userId", "skillId") on conflict rollback 
    ) strict
  `,
	).run();

	db.prepare(
		`create index skill_team_user_user_id on "SkillTeamUser"("userId")`,
	).run();
	db.prepare(
		`create index skill_team_user_skill_id on "SkillTeamUser"("skillId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "MapResult" (
      "mode" text not null,
      "stageId" integer not null,
      "userId" integer not null,
      "wins" integer not null,
      "losses" integer not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      unique("userId", "stageId", "mode") on conflict rollback 
    ) strict
  `,
	).run();

	db.prepare(`create index map_result_user_id on "MapResult"("userId")`).run();

	db.prepare(
		/*sql*/ `
    create table "PlayerResult" (
      "ownerUserId" integer not null,
      "otherUserId" integer not null,
      "mapWins" integer not null,
      "mapLosses" integer not null,
      "setWins" integer not null,
      "setLosses" integer not null,
      "type" text not null,
      foreign key ("ownerUserId") references "User"("id") on delete cascade,
      foreign key ("otherUserId") references "User"("id") on delete cascade,
      unique("ownerUserId", "otherUserId", "type") on conflict rollback 
    ) strict
  `,
	).run();

	db.prepare(
		`create index player_result_owner_user_id on "PlayerResult"("ownerUserId")`,
	).run();
	db.prepare(
		`create index player_result_other_user_id on "PlayerResult"("otherUserId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentResult" (
      "tournamentId" integer not null,
      "userId" integer not null,
      "placement" integer not null,
      "isHighlight" integer not null default 0,
      "participantCount" integer not null,
      "tournamentTeamId" integer not null,
      foreign key ("userId") references "User"("id") on delete cascade,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade,
      unique("userId", "tournamentId") on conflict rollback 
    ) strict
  `,
	).run();

	db.prepare(
		`create index tournament_result_user_id on "TournamentResult"("userId")`,
	).run();
	db.prepare(
		`create index tournament_result_tournament_id on "TournamentResult"("tournamentId")`,
	).run();
}
