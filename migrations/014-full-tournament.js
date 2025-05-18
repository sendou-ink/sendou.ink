export function up(db) {
	db.prepare(
		/*sql*/ `alter table "CalendarEvent" drop column "isBeforeStart"`,
	).run();

	db.prepare(/*sql*/ `drop table "TournamentTeam"`).run();
	db.prepare(
		/*sql*/ `
    create table "TournamentTeam" (
      "id" integer primary key,
      "name" text,
      "friendCode" text,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      "seed" integer,
      "checkedInAt" integer,
      "inviteCode" text not null unique,
      "calendarEventId" integer not null,
      foreign key ("calendarEventId") references "CalendarEvent"("id") on delete cascade,
      unique("calendarEventId", "name") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		`create index tournament_team_calendar_event_id on "TournamentTeam"("calendarEventId")`,
	).run();

	db.prepare(/*sql*/ `drop table "TournamentTeamMember"`).run();
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
    create table "TournamentBracket" (
      "id" integer primary key,
      "calendarEventId" integer not null,
      "type" text not null,
      foreign key ("calendarEventId") references "CalendarEvent"("id") on delete restrict
    ) strict
    `,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_bracket_calendar_event_id on "TournamentBracket"("calendarEventId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentRound" (
      "id" integer primary key,
      "position" integer not null,
      "bracketId" integer not null,
      "bestOf" integer not null,
      foreign key ("bracketId") references "TournamentBracket"("id") on delete cascade,
      unique("bracketId", "position") on conflict rollback
    ) strict
    `,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentMatch" (
      "id" integer primary key,
      "roundId" integer not null,
      "number" integer,
      "position" integer not null,
      "winnerDestinationMatchId" integer,
      "loserDestinationMatchId" integer,
      foreign key ("roundId") references "TournamentRound"("id") on delete cascade,
      foreign key ("winnerDestinationMatchId") references "TournamentMatch"("id") on delete restrict,
      foreign key ("loserDestinationMatchId") references "TournamentMatch"("id") on delete restrict
    ) strict
    `,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_match_round_id on "TournamentMatch"("roundId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentMatchParticipant" (
      "order" text not null,
      "teamId" integer not null,
      "matchId" integer not null,
      foreign key ("teamId") references "TournamentTeam"("id") on delete restrict,
      foreign key ("matchId") references "TournamentMatch"("id") on delete restrict,
      unique("teamId", "matchId") on conflict rollback
    ) strict
    `,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_match_participant_team_id on "TournamentMatchParticipant"("teamId")`,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_match_participant_match_id on "TournamentMatchParticipant"("matchId")`,
	).run();

	db.prepare(
		/*sql*/ `
    create table "TournamentMatchGameResult" (
      "id" integer primary key,
      "matchId" integer unique not null,
      "stageId" integer not null,
      "mode" text not null,
      "winnerTeamId" integer not null,
      "reporterId" integer not null,
      "createdAt" integer default (strftime('%s', 'now')) not null,
      foreign key ("matchId") references "TournamentMatch"("id") on delete cascade,
      foreign key ("winnerTeamId") references "TournamentTeam"("id") on delete restrict,
      foreign key ("reporterId") references "User"("id") on delete restrict
    ) strict
    `,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_match_game_result_match_id on "TournamentMatchGameResult"("matchId")`,
	).run();
	db.prepare(
		/*sql*/ `create index tournament_match_game_result_winner_team_id on "TournamentMatchGameResult"("winnerTeamId")`,
	).run();
}
