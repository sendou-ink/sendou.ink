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
	})();
}
