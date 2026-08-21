import type { Kysely } from "kysely";

/**
 * Drops nine indexes, ~180MB, that are each a strict leftmost prefix of another index on the
 * same table. SQLite seeks a prefix of a composite index exactly as it would a dedicated one,
 * so every lookup these served is already served by the wider index that replaces them here,
 * including the foreign key enforcement the ones on child key columns were carrying.
 *
 * What a narrow index can still do that its wider replacement cannot is order by rowid within
 * a key group, and sweep fewer bytes per seek because it packs more entries into a page. The
 * first costs nothing here, as no query orders on a bare prefix of these. The second is why
 * `tournament_match_game_result_participant_match_game_result_id` is kept despite being just
 * as redundant: `findAllResultsByTournamentId` seeks it once per game result of a tournament,
 * and paying those seeks against the 28% larger unique index instead measured a consistent
 * 31ms -> 36ms on the benchmark. The rest are seeked far too few times per request to notice.
 */
const REDUNDANT_INDEXES = [
	// covered by sqlite_autoindex_PlayerResult_1 ("ownerUserId", "otherUserId", "type", "season")
	"player_result_owner_user_id",
	// covered by reported_weapon_user_created_at_weapon ("userId", "createdAt", "weaponSplId")
	"reported_weapon_user_id",
	// covered by sqlite_autoindex_ReportedWeapon_1 ("groupMatchId", "mapIndex", "userId")
	"reported_weapon_group_match_id",
	// covered by sqlite_autoindex_ReportedWeapon_2 ("tournamentMatchId", "mapIndex", "userId")
	"reported_weapon_tournament_match_id",
	// covered by map_result_user_id_season ("userId", "season")
	"map_result_user_id",
	// covered by skill_user_id_season ("userId", "season")
	"skill_user_id",
	// covered by skill_season_user_id_leaderboard ("season", "userId", "groupMatchId", "ordinal", "matchesCount")
	"skill_season",
	// covered by sqlite_autoindex_GroupMember_1 ("userId", "groupId")
	"group_member_user_id",
	// covered by sqlite_autoindex_GroupMatchMap_1 ("matchId", "index")
	"group_match_map_match_id",
];

export async function up(db: Kysely<any>): Promise<void> {
	for (const indexName of REDUNDANT_INDEXES) {
		await db.schema.dropIndex(indexName).execute();
	}
}
