export function up(db) {
	db.transaction(() => {
		// Covering index for season-scoped per-user Skill aggregates: the user SP
		// leaderboard's latest-skill-per-user group-by and the SQ match count
		// (groupMatchId included so neither needs rowid lookups).
		db.prepare(
			/* sql */ `create index skill_season_user_id_group_match_id on "Skill"("season", "userId", "groupMatchId")`,
		).run();

		// Covering index for the team leaderboard's latest-skill-per-identifier
		// group-by (previously filtered via skill_season + temp B-tree).
		db.prepare(
			/* sql */ `create index skill_season_identifier on "Skill"("season", "identifier")`,
		).run();

		// Covering index for the XP leaderboards' max(power) per player group-by;
		// mode/weaponSplId/name included so the all/mode/weapon variants are all
		// answered without touching the table.
		db.prepare(
			/* sql */ `create index xrank_placement_player_power on "XRankPlacement"("playerId", "power", "mode", "weaponSplId", "name")`,
		).run();
	})();
}
