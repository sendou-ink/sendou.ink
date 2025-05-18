export function up(db) {
	db.prepare(/* sql */ `drop index "calendar_event_custom_url_unique"`).run();
	db.prepare(/*sql*/ `drop table "TournamentBracket"`).run();
	db.prepare(/*sql*/ `drop table "TournamentMatchParticipant"`).run();
	db.prepare(/*sql*/ `drop table "TournamentRound"`).run();
	db.prepare(/*sql*/ `drop table "TournamentMatch"`).run();
	db.prepare(/*sql*/ `drop table "TournamentTeam"`).run();
	db.prepare(/*sql*/ `drop table "TournamentTeamMember"`).run();
	db.prepare(/*sql*/ `drop table "TournamentMatchGameResult"`).run();

	db.prepare(
		/* sql */ `alter table "CalendarEvent" drop column "customUrl"`,
	).run();
	db.prepare(
		/* sql */ `alter table "CalendarEvent" drop column "toToolsEnabled"`,
	).run();
	db.prepare(
		/* sql */ `alter table "CalendarEvent" drop column "toToolsMode"`,
	).run();
	db.prepare(
		/* sql */ `alter table "CalendarEvent" drop column "isBeforeStart"`,
	).run();

	db.prepare(
		/* sql */ `alter table "CalendarEvent" add "tournamentId" integer`,
	).run();
	db.prepare(
		/*sql*/ `create index calendar_event_tournament_id on "CalendarEvent"("tournamentId")`,
	).run();

	db.prepare(
		/*sql*/ `
  create table "Tournament" (
    "id" integer primary key,
    "mapPickingStyle" text not null,
    "format" text not null,
    "showMapListGenerator" integer default 0
  ) strict
  `,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentTeam" (
      "id" integer primary key,
      "name" text not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "seed" integer,
      "inviteCode" text not null unique,
      "tournamentId" integer not null,
      "prefersNotToHost" integer not null default 0,
      foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
      unique("tournamentId", "name") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_team_tournament_id on "TournamentTeam"("tournamentId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentTeamCheckIn" (
      "tournamentTeamId" integer not null,
      "checkedInAt" integer not null,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade
    ) strict
    `,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_team_check_in_tournament_team_id on "TournamentTeamCheckIn"("tournamentTeamId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentTeamMember" (
      "tournamentTeamId" integer not null,
      "userId" integer not null,
      "isOwner" integer not null default 0,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("tournamentTeamId") references "TournamentTeam"("id") on delete cascade,
      unique("tournamentTeamId", "userId") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_team_member_tournament_team_id on "TournamentTeamMember"("tournamentTeamId")`,
	).run();

	db.prepare(
		/*sql*/ `
  create table "TournamentStage" (
    "id" integer primary key,
    "tournamentId" integer not null,
    "name" text not null,
    "type" text not null,
    "settings" text not null,
    "number" integer not null,
    foreign key ("tournamentId") references "Tournament"("id") on delete cascade,
    unique("number", "tournamentId") on conflict rollback
  ) strict
  `,
	).run();
	db.prepare(
		`create index tournament_stage_tournament_id on "TournamentStage"("tournamentId")`,
	).run();

	db.prepare(
		/*sql*/ `
  create table "TournamentGroup" (
    "id" integer primary key,
    "stageId" integer not null,
    "number" integer not null,
    foreign key ("stageId") references "TournamentStage"("id") on delete cascade,
    unique("number", "stageId") on conflict rollback
  ) strict
  `,
	).run();
	db.prepare(
		`create index tournament_group_stage_id on "TournamentGroup"("stageId")`,
	).run();

	db.prepare(
		/*sql*/ `
  create table "TournamentRound" (
    "id" integer primary key,
    "stageId" integer not null,
    "groupId" integer not null,
    "number" integer not null,
    foreign key ("stageId") references "TournamentStage"("id") on delete cascade,
    foreign key ("groupId") references "TournamentGroup"("id") on delete cascade,
    unique("number", "groupId") on conflict rollback
  ) strict
  `,
	).run();
	db.prepare(
		`create index tournament_round_stage_id on "TournamentRound"("stageId")`,
	).run();
	db.prepare(
		`create index tournament_round_group_id on "TournamentRound"("groupId")`,
	).run();

	db.prepare(
		/*sql*/ `
  create table "TournamentMatch" (
    "id" integer primary key,
    "childCount" integer not null,
    "bestOf" integer not null default 3,
    "roundId" integer not null,
    "stageId" integer not null,
    "groupId" integer not null,
    "number" integer not null,
    "opponentOne" text not null,
    "opponentTwo" text not null,
    "status" integer not null,
    foreign key ("roundId") references "TournamentRound"("id") on delete cascade,
    foreign key ("stageId") references "TournamentStage"("id") on delete cascade,
    foreign key ("groupId") references "TournamentGroup"("id") on delete cascade,
    unique("number", "roundId") on conflict rollback
  ) strict
  `,
	).run();
	db.prepare(
		`create index tournament_match_round_id on "TournamentMatch"("roundId")`,
	).run();
	db.prepare(
		`create index tournament_match_stage_id on "TournamentMatch"("stageId")`,
	).run();
	db.prepare(
		`create index tournament_match_group_id on "TournamentMatch"("groupId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentMatchGameResult" (
      "id" integer primary key,
      "matchId" integer not null,
      "number" integer not null,
      "stageId" integer not null,
      "mode" text not null,
      "source" text not null,
      "winnerTeamId" integer not null,
      "reporterId" integer not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("matchId") references "TournamentMatch"("id") on delete cascade,
      foreign key ("winnerTeamId") references "TournamentTeam"("id") on delete restrict,
      foreign key ("reporterId") references "User"("id") on delete restrict,
      unique("matchId", "number") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_match_game_result_match_id on "TournamentMatchGameResult"("matchId")`,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_match_game_result_winner_team_id on "TournamentMatchGameResult"("winnerTeamId")`,
	).run();

	db.prepare(
		/*sql*/ `
  create table "TournamentMatchGameResultParticipant" (
    "matchGameResultId" integer not null,
    "userId" integer not null,
    foreign key ("matchGameResultId") references "TournamentMatchGameResult"("id") on delete cascade,
    foreign key ("userId") references "User"("id") on delete cascade,
    unique("matchGameResultId", "userId") on conflict rollback
  ) strict
  `,
	).run();
	db.prepare(
		`create index tournament_match_game_result_participant_match_game_result_id on "TournamentMatchGameResultParticipant"("matchGameResultId")`,
	).run();
	db.prepare(
		`create index tournament_match_game_result_participant_user_id on "TournamentMatchGameResultParticipant"("userId")`,
	).run();

	db.prepare(
		/*sql*/ `
  create table "TrustRelationship" (
    "trustGiverUserId" integer not null,
    "trustReceiverUserId" integer not null,
    foreign key ("trustGiverUserId") references "User"("id") on delete cascade,
    foreign key ("trustReceiverUserId") references "User"("id") on delete cascade,
    unique("trustGiverUserId", "trustReceiverUserId") on conflict ignore
  ) strict
  `,
	).run();
	db.prepare(
		`create index trust_relationship_trust_giver_user_id on "TrustRelationship"("trustGiverUserId")`,
	).run();
	db.prepare(
		`create index trust_relationship_trust_receiver_user_id on "TrustRelationship"("trustReceiverUserId")`,
	).run();
}
