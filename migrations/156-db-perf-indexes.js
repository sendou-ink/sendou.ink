export function up(db) {
	db.transaction(() => {
		db.prepare(
			`create index all_team_avatar_img_id on "AllTeam"("avatarImgId")`,
		).run();
		db.prepare(
			`create index all_team_banner_img_id on "AllTeam"("bannerImgId")`,
		).run();
		db.prepare(
			`create index calendar_event_avatar_img_id on "CalendarEvent"("avatarImgId")`,
		).run();
		// votedId/tier/score included so the PlusVotingResult view's group by can
		// follow index order over a voting's ~35k rows instead of a temp b-tree
		db.prepare(
			`create index plus_vote_year_month on "PlusVote"("year", "month", "votedId", "tier", "score")`,
		).run();
		db.prepare(
			`create index reported_weapon_tournament_created_at on "ReportedWeapon"("createdAt", "userId", "weaponSplId", "tournamentMatchId") where "tournamentMatchId" is not null`,
		).run();
		db.prepare(
			`create index reported_weapon_group_match_user_weapon on "ReportedWeapon"("groupMatchId", "userId", "weaponSplId")`,
		).run();
		// widened versions of migration 146's Skill indexes: ordinal + matchesCount
		// included so the leaderboards' latest-skill-per-group queries are answered
		// without rowid lookups (the bare-column max(id) form)
		db.prepare("drop index skill_season_identifier").run();
		db.prepare(
			`create index skill_season_identifier_leaderboard on "Skill"("season", "identifier", "ordinal", "matchesCount")`,
		).run();
		db.prepare("drop index skill_season_user_id_group_match_id").run();
		db.prepare(
			`create index skill_season_user_id_leaderboard on "Skill"("season", "userId", "groupMatchId", "ordinal", "matchesCount")`,
		).run();
		// power-descending indexes let the XP leaderboards walk placements from
		// the top and stop at the 500th distinct player instead of aggregating
		// every player's max power first
		db.prepare(
			`create index xrank_placement_power on "XRankPlacement"("power" desc)`,
		).run();
		db.prepare(
			`create index xrank_placement_mode_power on "XRankPlacement"("mode", "power" desc)`,
		).run();
		db.prepare(
			`create index xrank_placement_weapon_power on "XRankPlacement"("weaponSplId", "power" desc)`,
		).run();
		db.prepare(
			`create index calendar_event_result_team_event_id on "CalendarEventResultTeam"("eventId")`,
		).run();
		// covering partial index so map/mode preference aggregation doesn't scan
		// the full (wide-row) User table
		db.prepare(
			`create index user_map_mode_preferences on "User"("id", "mapModePreferences") where "mapModePreferences" is not null`,
		).run();
		// only ~20 of the hundreds of thousands of Group rows are not INACTIVE
		db.prepare(
			`create index group_status_active on "Group"("status") where "status" != 'INACTIVE'`,
		).run();
		db.prepare(`create index art_created_at on "Art"("createdAt" desc)`).run();
	})();
}
