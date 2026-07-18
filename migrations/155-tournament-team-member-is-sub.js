export function up(db) {
	db.transaction(() => {
		db.prepare(
			/*sql*/ `alter table "TournamentTeamMember" add column "isSub" integer not null default 0`,
		).run();

		// backfill from the previous time-based detection: a member registered after
		// the tournament's registration closed (organizer-set regClosesAt, otherwise
		// the tournament start time) is considered a sub
		db.prepare(
			/*sql*/ `
			update "TournamentTeamMember"
			set "isSub" = 1
			where "createdAt" > (
				select coalesce(
					"Tournament"."settings" ->> 'regClosesAt',
					min("CalendarEventDate"."startTime")
				)
				from "TournamentTeam"
				inner join "Tournament"
					on "Tournament"."id" = "TournamentTeam"."tournamentId"
				inner join "CalendarEvent"
					on "CalendarEvent"."tournamentId" = "Tournament"."id"
				inner join "CalendarEventDate"
					on "CalendarEventDate"."eventId" = "CalendarEvent"."id"
				where "TournamentTeam"."id" = "TournamentTeamMember"."tournamentTeamId"
			)
		`,
		).run();
	})();
}
