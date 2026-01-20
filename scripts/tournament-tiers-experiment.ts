/**
 * Tournament Tiering Experiment Script
 *
 * Run with: npx tsx scripts/tournament-tiers-experiment.ts
 *
 * Calculates tournament tiers based on top teams' average SeedingSkill.
 * Tweak the THRESHOLDS object to experiment with different tier distributions.
 */

import Database from "better-sqlite3";

const db = new Database("db-prod.sqlite3", { readonly: true });

// ============================================================================
// CONFIGURATION - Tweak these values to experiment
// ============================================================================

/**
 * Minimum ordinal thresholds for each tier.
 * A tournament is assigned the highest tier where its score meets the threshold.
 *
 * Current values are based on percentile analysis:
 * - X: Top ~1% of tournaments
 * - S+: Top ~3%
 * - S: Top ~8%
 * - A+: Top ~15%
 * - A: Top ~25%
 * - B+: Top ~40%
 * - B: Top ~55%
 * - C+: Top ~75%
 * - C: Everything else
 */
const THRESHOLDS = {
	X: 32,
	"S+": 29,
	S: 26,
	"A+": 24,
	A: 21,
	"B+": 15,
	B: 10,
	"C+": 5,
	C: Number.NEGATIVE_INFINITY, // Catch-all
} as const;

/**
 * How many top teams to consider for the tournament score.
 * Using 8 captures the competitive core of most tournaments.
 */
const TOP_TEAMS_COUNT = 8;

/**
 * Minimum number of teams required for a tournament to be tiered.
 * Tournaments with fewer teams will be marked as "UNTIERED".
 */
const MIN_TEAMS_FOR_TIERING = 8;

/**
 * Whether to apply a size bonus for larger tournaments.
 * Set to 0 to disable, or a value like 0.05 to add 5% per 10 teams above minimum.
 */
const SIZE_BONUS_PER_10_TEAMS = 0;

/**
 * Filter to only include tournaments after this date (ISO string).
 * Set to null to include all tournaments.
 */
const MIN_DATE: string | null = null; // e.g., "2024-01-01"

// ============================================================================
// IMPLEMENTATION
// ============================================================================

type Tier = keyof typeof THRESHOLDS;

interface TournamentData {
	tournamentId: number;
	eventId: number;
	name: string;
	startTime: number;
	teamCount: number;
	top8AvgOrdinal: number | null;
	adjustedScore: number | null;
	tier: Tier | "UNTIERED";
}

function calculateTier(score: number | null): Tier | "UNTIERED" {
	if (score === null) return "UNTIERED";

	const tiers = Object.entries(THRESHOLDS) as [Tier, number][];
	for (const [tier, threshold] of tiers) {
		if (score >= threshold) return tier;
	}
	return "C";
}

function calculateAdjustedScore(rawScore: number, teamCount: number): number {
	if (SIZE_BONUS_PER_10_TEAMS === 0) return rawScore;

	const teamsAboveMin = Math.max(0, teamCount - MIN_TEAMS_FOR_TIERING);
	const bonus = (teamsAboveMin / 10) * SIZE_BONUS_PER_10_TEAMS * rawScore;
	return rawScore + bonus;
}

function getTournamentData(): TournamentData[] {
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
      ce.id as eventId,
      ce.name,
      ced.startTime,
      ts.team_count as teamCount,
      ts.top8_avg_ordinal as top8AvgOrdinal
    FROM Tournament t
    JOIN CalendarEvent ce ON ce.tournamentId = t.id
    JOIN CalendarEventDate ced ON ced.eventId = ce.id
    LEFT JOIN TournamentScores ts ON ts.tournamentId = t.id
    WHERE t.isFinalized = 1
    ${MIN_DATE ? `AND ced.startTime >= strftime('%s', '${MIN_DATE}') * 1000` : ""}
    GROUP BY t.id
    ORDER BY ced.startTime DESC
  `;

	const rows = db.prepare(query).all() as Array<{
		tournamentId: number;
		eventId: number;
		name: string;
		startTime: number;
		teamCount: number | null;
		top8AvgOrdinal: number | null;
	}>;

	return rows.map((row) => {
		const teamCount = row.teamCount ?? 0;
		const meetsMinTeams = teamCount >= MIN_TEAMS_FOR_TIERING;

		let adjustedScore: number | null = null;
		if (row.top8AvgOrdinal !== null && meetsMinTeams) {
			adjustedScore = calculateAdjustedScore(row.top8AvgOrdinal, teamCount);
		}

		return {
			tournamentId: row.tournamentId,
			eventId: row.eventId,
			name: row.name,
			startTime: row.startTime,
			teamCount,
			top8AvgOrdinal: row.top8AvgOrdinal,
			adjustedScore,
			tier: meetsMinTeams ? calculateTier(adjustedScore) : "UNTIERED",
		};
	});
}

function printDistribution(tournaments: TournamentData[]) {
	const distribution: Record<string, number> = {};
	const tiers = [...Object.keys(THRESHOLDS), "UNTIERED"];

	for (const tier of tiers) {
		distribution[tier] = 0;
	}

	for (const t of tournaments) {
		distribution[t.tier]++;
	}

	const total = tournaments.length;
	const tiered = total - distribution["UNTIERED"];

	console.log("\n" + "=".repeat(60));
	console.log("TIER DISTRIBUTION");
	console.log("=".repeat(60));
	console.log(`Total tournaments: ${total}`);
	console.log(`Tiered (${MIN_TEAMS_FOR_TIERING}+ teams): ${tiered}`);
	console.log(
		`Untiered (< ${MIN_TEAMS_FOR_TIERING} teams): ${distribution["UNTIERED"]}`,
	);
	console.log("-".repeat(60));

	for (const tier of tiers) {
		if (tier === "UNTIERED") continue;
		const count = distribution[tier];
		const pctOfTotal = ((count / total) * 100).toFixed(1);
		const pctOfTiered = tiered > 0 ? ((count / tiered) * 100).toFixed(1) : "0";
		const bar = "█".repeat(Math.round(count / 20));
		console.log(
			`${tier.padEnd(3)} | ${String(count).padStart(4)} | ${pctOfTiered.padStart(5)}% of tiered | ${bar}`,
		);
	}
}

function formatDate(timestamp: number): string {
	// timestamps are stored in seconds, not milliseconds
	return new Date(timestamp * 1000).toISOString().split("T")[0];
}

function printTopTournaments(
	tournaments: TournamentData[],
	tier: Tier,
	limit = 10,
) {
	const filtered = tournaments
		.filter((t) => t.tier === tier)
		.sort((a, b) => (b.adjustedScore ?? 0) - (a.adjustedScore ?? 0))
		.slice(0, limit);

	console.log("\n" + "=".repeat(60));
	console.log(`TOP ${limit} ${tier}-TIER TOURNAMENTS`);
	console.log("=".repeat(60));

	for (const t of filtered) {
		const date = formatDate(t.startTime);
		console.log(
			`[${date}] ${t.name.substring(0, 40).padEnd(40)} | ${t.teamCount} teams | score: ${t.adjustedScore?.toFixed(1)}`,
		);
	}
}

function printBottomOfTier(
	tournaments: TournamentData[],
	tier: Tier,
	limit = 5,
) {
	const filtered = tournaments
		.filter((t) => t.tier === tier)
		.sort((a, b) => (a.adjustedScore ?? 0) - (b.adjustedScore ?? 0))
		.slice(0, limit);

	console.log("\n" + "-".repeat(60));
	console.log(`BOTTOM ${limit} OF ${tier}-TIER (borderline)`);
	console.log("-".repeat(60));

	for (const t of filtered) {
		const date = formatDate(t.startTime);
		console.log(
			`[${date}] ${t.name.substring(0, 40).padEnd(40)} | ${t.teamCount} teams | score: ${t.adjustedScore?.toFixed(1)}`,
		);
	}
}

function printThresholds() {
	console.log("\n" + "=".repeat(60));
	console.log("CURRENT THRESHOLDS");
	console.log("=".repeat(60));
	for (const [tier, threshold] of Object.entries(THRESHOLDS)) {
		if (threshold === -Infinity) {
			console.log(`${tier}: < ${THRESHOLDS["C+"]}`);
		} else {
			console.log(`${tier}: >= ${threshold}`);
		}
	}
	console.log(`\nTop teams considered: ${TOP_TEAMS_COUNT}`);
	console.log(`Min teams for tiering: ${MIN_TEAMS_FOR_TIERING}`);
	console.log(`Size bonus per 10 teams: ${SIZE_BONUS_PER_10_TEAMS * 100}%`);
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
	console.log("Tournament Tiering Experiment");
	console.log("==============================\n");

	printThresholds();

	const tournaments = getTournamentData();
	printDistribution(tournaments);

	// Show examples from top tiers
	printTopTournaments(tournaments, "X", 15);
	printBottomOfTier(tournaments, "X", 5);

	printTopTournaments(tournaments, "S+", 10);
	printBottomOfTier(tournaments, "S+", 5);

	printTopTournaments(tournaments, "S", 10);

	// Recent tournaments analysis
	console.log("\n" + "=".repeat(60));
	console.log("RECENT TOURNAMENTS (last 30 tiered)");
	console.log("=".repeat(60));
	tournaments
		.filter((t) => t.tier !== "UNTIERED")
		.sort((a, b) => b.startTime - a.startTime)
		.slice(0, 30)
		.forEach((t) => {
			const date = formatDate(t.startTime);
			const safeName = t.name.substring(0, 35).padEnd(35);
			console.log(
				`${t.tier.padEnd(3)} | [${date}] ${safeName} | ${String(t.teamCount).padStart(3)} teams | ${t.adjustedScore?.toFixed(1)}`,
			);
		});

	// Full CSV dump ordered by score
	console.log("\n" + "=".repeat(60));
	console.log("FULL CSV DUMP (ordered by score descending)");
	console.log("=".repeat(60));
	console.log("name,score,tier");
	tournaments
		.filter((t) => t.tier !== "UNTIERED")
		.sort((a, b) => (b.adjustedScore ?? 0) - (a.adjustedScore ?? 0))
		.forEach((t) => {
			const safeName = t.name.replace(/,/g, ";").replace(/"/g, "'");
			console.log(`"${safeName}",${t.adjustedScore?.toFixed(2)},${t.tier}`);
		});
}

main();
db.close();
