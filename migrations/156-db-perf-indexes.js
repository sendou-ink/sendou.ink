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
		db.prepare(
			`create index plus_vote_year_month on "PlusVote"("year", "month")`,
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
	})();
}
