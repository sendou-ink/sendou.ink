export function up(db) {
	db.transaction(() => {
		db.prepare(
			/* sql */ `create index user_patron_tier on "User"("patronTier")`,
		).run();

		db.prepare(
			/* sql */ `create index calendar_event_result_player_user_id on "CalendarEventResultPlayer"("userId")`,
		).run();
		db.prepare(
			/* sql */ `create index calendar_event_result_player_team_id on "CalendarEventResultPlayer"("teamId")`,
		).run();
	})();
}
