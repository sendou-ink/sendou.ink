/** biome-ignore-all lint/suspicious/noConsole: CLI script output */
/**
 * Backfill Tournament Tiers Script
 *
 * Run with: npx tsx scripts/backfill-tournament-tiers.ts
 *
 * Retroactively calculates and sets tiers for all finalized tournaments.
 */

import { sql } from "~/db/sql";
import {
	calculateAdjustedScore,
	calculateTierNumber,
	MIN_TEAMS_FOR_TIERING,
	TOP_TEAMS_COUNT,
} from "../app/features/tournament/core/tiering";

const dryRun = process.argv.includes("--dry-run");

interface TournamentScore {
	tournamentId: number;
	teamCount: number;
	top8AvgOrdinal: number | null;
}

function getTournamentScores(): TournamentScore[] {
	const query = `
    WITH TeamSkills AS (
      SELECT
        tt.tournamentId,
        tt.id as teamId,
        AVG(ss.ordinal) as avg_team_ordinal
      FROM TournamentTeam tt
      JOIN TournamentTeamMember ttm ON ttm.tournamentTeamId = tt.id
      LEFT JOIN SeedingSkill ss ON ss.userId = ttm.userId AND ss.type = 'RANKED'
      WHERE tt.droppedOut = 0
      GROUP BY tt.tournamentId, tt.id
    ),
    TeamCounts AS (
      SELECT tournamentId, COUNT(*) as team_count
      FROM TeamSkills
      WHERE avg_team_ordinal IS NOT NULL
      GROUP BY tournamentId
    ),
    RankedTeams AS (
      SELECT
        ts.tournamentId,
        ts.avg_team_ordinal,
        tc.team_count,
        ROW_NUMBER() OVER (PARTITION BY ts.tournamentId ORDER BY ts.avg_team_ordinal DESC) as rank
      FROM TeamSkills ts
      JOIN TeamCounts tc ON tc.tournamentId = ts.tournamentId
      WHERE ts.avg_team_ordinal IS NOT NULL
    ),
    TournamentScores AS (
      SELECT
        tournamentId,
        AVG(avg_team_ordinal) as top8_avg_ordinal,
        MAX(team_count) as team_count
      FROM RankedTeams
      WHERE rank <= ${TOP_TEAMS_COUNT}
      GROUP BY tournamentId
    )
    SELECT
      t.id as tournamentId,
      COALESCE(ts.team_count, 0) as teamCount,
      ts.top8_avg_ordinal as top8AvgOrdinal
    FROM Tournament t
    LEFT JOIN TournamentScores ts ON ts.tournamentId = t.id
    WHERE t.isFinalized = 1
  `;

	return sql.prepare(query).all() as TournamentScore[];
}

function main() {
	console.log("Backfilling tournament tiers");
	if (dryRun) {
		console.log("DRY RUN - no changes will be made\n");
	}

	const tournaments = getTournamentScores();
	console.log(`Found ${tournaments.length} finalized tournaments\n`);

	const updateStatement = sql.prepare(
		/* sql */ `UPDATE "Tournament" SET tier = @tier WHERE id = @tournamentId`,
	);

	const tierCounts: Record<string, number> = {};
	let updatedCount = 0;
	let skippedCount = 0;

	for (const t of tournaments) {
		const meetsMinTeams = t.teamCount >= MIN_TEAMS_FOR_TIERING;

		let tierNumber: number | null = null;
		if (t.top8AvgOrdinal !== null && meetsMinTeams) {
			const adjustedScore = calculateAdjustedScore(
				t.top8AvgOrdinal,
				t.teamCount,
			);
			tierNumber = calculateTierNumber(adjustedScore);
		}

		if (tierNumber !== null) {
			tierCounts[tierNumber] = (tierCounts[tierNumber] || 0) + 1;
			updatedCount++;
		} else {
			skippedCount++;
		}

		if (!dryRun) {
			updateStatement.run({ tier: tierNumber, tournamentId: t.tournamentId });
		}
	}

	console.log("Tier distribution:");
	const tierNames: Record<number, string> = {
		1: "X",
		2: "S+",
		3: "S",
		4: "A+",
		5: "A",
		6: "B+",
		7: "B",
		8: "C+",
		9: "C",
	};
	for (let i = 1; i <= 9; i++) {
		console.log(`  ${tierNames[i]}: ${tierCounts[i] || 0}`);
	}

	console.log(`\nUpdated: ${updatedCount} tournaments`);
	console.log(`Skipped (untiered): ${skippedCount} tournaments`);

	if (dryRun) {
		console.log("\nRun without --dry-run to apply changes");
	}
}

main();
