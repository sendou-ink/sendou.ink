import { type Kysely, sql, type Transaction } from "kysely";

/**
 * Turns leagues into normal tournaments.
 *
 * Before: a league was a "signup" tournament holding the registrations plus one child tournament
 * per division, linked via `Tournament.parentTournamentId`. After: one tournament per season with
 * `settings.isLeague` and two brackets per division (group stage + playoffs), teams pointing at
 * their division via `startingBracketIdx` and the weekly play dates stored per round.
 */
export async function up(db: Kysely<any>): Promise<void> {
	await db.transaction().execute(async (trx) => {
		await trx.schema
			.alterTable("TournamentRound")
			.addColumn("defaultPlayTime", "integer")
			.execute();

		await createDivisionTierTable(trx);

		// the divisions carry their own tier over, so they are done before the backfill below
		for (const season of SEASONS) {
			await migrateSeason(trx, season);
		}

		await trx.schema
			.alterTable("Tournament")
			.dropColumn("parentTournamentId")
			.execute();

		await backfillDivisionTiers(trx);
	});
}

type Season = {
	/** Tournament that held the registrations. Becomes the tournament of the whole season. */
	signupTournamentId: number;
	year: number;
	/** ISO week each group stage round is played, in round order. */
	weekNumbers: number[];
	/** Division tournaments from the highest division to the lowest. */
	divisions: Array<{ tournamentId: number; label: string }>;
};

const divisionsOfSeason = (firstTournamentId: number) =>
	[
		"Division X",
		"Division 1",
		"Division 2",
		"Division 3",
		"Division 4",
		"Division 5",
		"Division 6",
		"Division 7",
		"Division 8",
		"Division 9 Americas",
		"Division 9 World",
		"Division 10 Americas",
		"Division 10 World",
	].map((label, idx) => ({ tournamentId: firstTournamentId + idx, label }));

const SEASONS: Season[] = [
	{
		signupTournamentId: 1066,
		year: 2025,
		weekNumbers: [10, 11, 12, 13, 14],
		divisions: divisionsOfSeason(1241),
	},
	{
		signupTournamentId: 3192,
		year: 2026,
		weekNumbers: [9, 10, 11, 12, 13],
		divisions: divisionsOfSeason(3325),
	},
];

async function migrateSeason(trx: Transaction<any>, season: Season) {
	const signup = await trx
		.selectFrom("Tournament")
		.select(["id", "settings", "castTwitchAccounts", "castedMatchesInfo"])
		.where("id", "=", season.signupTournamentId)
		.executeTakeFirst();

	// databases without the production league data (dev, tests)
	if (!signup) return;

	const divisions = [];
	for (const [idx, division] of season.divisions.entries()) {
		const row = await trx
			.selectFrom("Tournament")
			.select([
				"id",
				"settings",
				"tier",
				"castTwitchAccounts",
				"castedMatchesInfo",
			])
			.where("id", "=", division.tournamentId)
			.executeTakeFirst();

		if (!row) {
			throw new Error(
				`League division tournament ${division.tournamentId} not found`,
			);
		}

		const progression = JSON.parse(row.settings).bracketProgression;
		if (progression.length !== 2) {
			throw new Error(
				`Expected 2 brackets in division tournament ${division.tournamentId}, got ${progression.length}`,
			);
		}

		divisions.push({
			...division,
			tier: row.tier as number | null,
			castTwitchAccounts: parseJson<string[]>(row.castTwitchAccounts),
			castedMatchesInfo: parseJson<CastedMatchesInfo>(row.castedMatchesInfo),
			groupStageIdx: idx * 2,
			playoffsIdx: idx * 2 + 1,
			groupStageBracket: progression[0],
			playoffsBracket: progression[1],
		});
	}

	await trx
		.updateTable("Tournament")
		.set({
			settings: JSON.stringify({
				...JSON.parse(signup.settings),
				isLeague: true,
				bracketProgression: divisions.flatMap((division) => [
					{ ...division.groupStageBracket, name: division.label },
					{
						...division.playoffsBracket,
						name: playoffsName(division.label),
						sources: division.playoffsBracket.sources.map((source: any) => ({
							...source,
							bracketIdx: division.groupStageIdx,
						})),
					},
				]),
			}),
			castTwitchAccounts: mergedCastTwitchAccounts(signup, divisions),
			castedMatchesInfo: mergedCastedMatchesInfo(signup, divisions),
			tier: bestTier(divisions),
			isFinalized: 1,
		})
		.where("id", "=", season.signupTournamentId)
		.execute();

	// each division keeps the tier it was given as a tournament of its own
	const tieredDivisions = divisions.filter(
		(division) => division.tier !== null,
	);
	if (tieredDivisions.length > 0) {
		await trx
			.insertInto("TournamentDivisionTier")
			.values(
				tieredDivisions.map((division) => ({
					tournamentId: season.signupTournamentId,
					bracketIdx: division.groupStageIdx,
					tier: division.tier,
				})),
			)
			.execute();
	}

	// rosters come from the divisions, where they were kept up to date over the season
	await trx
		.deleteFrom("TournamentTeam")
		.where("tournamentId", "=", season.signupTournamentId)
		.execute();

	for (const division of divisions) {
		const teamsOfDivision = (eb: any) =>
			eb
				.selectFrom("TournamentTeam")
				.select("TournamentTeam.id")
				.where("TournamentTeam.tournamentId", "=", division.tournamentId);

		for (const [oldIdx, newIdx] of [
			[0, division.groupStageIdx],
			[1, division.playoffsIdx],
		]) {
			await trx
				.updateTable("TournamentTeamCheckIn")
				.set({ bracketIdx: newIdx })
				.where("bracketIdx", "=", oldIdx)
				.where("tournamentTeamId", "in", teamsOfDivision)
				.execute();
		}

		const bracketIdxOfDivision = (idx: number) => {
			if (idx === 0) return division.groupStageIdx;
			if (idx === 1) return division.playoffsIdx;

			// -1 = eliminated from the tournament
			return idx;
		};

		const overrides = await trx
			.selectFrom("TournamentBracketProgressionOverride")
			.selectAll()
			.where("tournamentId", "=", division.tournamentId)
			.execute();
		for (const override of overrides) {
			await trx
				.updateTable("TournamentBracketProgressionOverride")
				.set({
					tournamentId: season.signupTournamentId,
					sourceBracketIdx: bracketIdxOfDivision(override.sourceBracketIdx),
					destinationBracketIdx: bracketIdxOfDivision(
						override.destinationBracketIdx,
					),
				})
				.where("tournamentTeamId", "=", override.tournamentTeamId)
				.where("sourceBracketIdx", "=", override.sourceBracketIdx)
				.execute();
		}

		await trx
			.updateTable("TournamentTeam")
			.set({
				tournamentId: season.signupTournamentId,
				startingBracketIdx: division.groupStageIdx,
			})
			.where("tournamentId", "=", division.tournamentId)
			.execute();

		// brackets resolve their stage by name, so these have to match the progression exactly
		for (const [bracket, name, bracketIdx] of [
			[division.groupStageBracket, division.label, division.groupStageIdx],
			[
				division.playoffsBracket,
				playoffsName(division.label),
				division.playoffsIdx,
			],
		] as const) {
			const stage = await trx
				.selectFrom("TournamentStage")
				.select("id")
				.where("tournamentId", "=", division.tournamentId)
				.where("name", "=", bracket.name)
				.executeTakeFirst();
			if (!stage) {
				throw new Error(
					`Stage "${bracket.name}" not found in division tournament ${division.tournamentId}`,
				);
			}

			await trx
				.updateTable("TournamentStage")
				.set({
					tournamentId: season.signupTournamentId,
					name,
					number: bracketIdx + 1,
				})
				.where("id", "=", stage.id)
				.execute();

			if (bracketIdx !== division.groupStageIdx) continue;

			for (const [roundIdx, weekNumber] of season.weekNumbers.entries()) {
				await trx
					.updateTable("TournamentRound")
					.set({
						defaultPlayTime: weekNumberToTimestamp({
							week: weekNumber,
							year: season.year,
						}),
					})
					.where("stageId", "=", stage.id)
					.where("number", "=", roundIdx + 1)
					.execute();
			}
		}

		// a user who played in two divisions keeps the row of the higher one, which was
		// already moved over as divisions are handled from the highest to the lowest
		await trx
			.deleteFrom("TournamentResult")
			.where("tournamentId", "=", division.tournamentId)
			.where("userId", "in", (eb: any) =>
				eb
					.selectFrom("TournamentResult as Existing")
					.select("Existing.userId")
					.where("Existing.tournamentId", "=", season.signupTournamentId),
			)
			.execute();
		await trx
			.updateTable("TournamentResult")
			.set({ tournamentId: season.signupTournamentId, div: division.label })
			.where("tournamentId", "=", division.tournamentId)
			.execute();

		await trx
			.deleteFrom("Skill")
			.where("tournamentId", "=", division.tournamentId)
			.where("userId", "in", (eb: any) =>
				eb
					.selectFrom("Skill as Existing")
					.select("Existing.userId")
					.where("Existing.tournamentId", "=", season.signupTournamentId)
					.where("Existing.userId", "is not", null),
			)
			.execute();
		await trx
			.deleteFrom("Skill")
			.where("tournamentId", "=", division.tournamentId)
			.where("userId", "is", null)
			.where("identifier", "in", (eb: any) =>
				eb
					.selectFrom("Skill as Existing")
					.select("Existing.identifier")
					.where("Existing.tournamentId", "=", season.signupTournamentId)
					.where("Existing.identifier", "is not", null),
			)
			.execute();
		await trx
			.updateTable("Skill")
			.set({ tournamentId: season.signupTournamentId })
			.where("tournamentId", "=", division.tournamentId)
			.execute();

		await trx
			.deleteFrom("TournamentStaff")
			.where("tournamentId", "=", division.tournamentId)
			.where("userId", "in", (eb: any) =>
				eb
					.selectFrom("TournamentStaff as Existing")
					.select("Existing.userId")
					.where("Existing.tournamentId", "=", season.signupTournamentId),
			)
			.execute();
		await trx
			.updateTable("TournamentStaff")
			.set({ tournamentId: season.signupTournamentId })
			.where("tournamentId", "=", division.tournamentId)
			.execute();

		await trx
			.deleteFrom("CalendarEvent")
			.where("tournamentId", "=", division.tournamentId)
			.execute();
		await trx
			.deleteFrom("Tournament")
			.where("id", "=", division.tournamentId)
			.execute();
	}
}

const playoffsName = (divisionLabel: string) => `${divisionLabel} Playoffs`;

type CastedMatchesInfo = {
	lockedMatches: Array<{ twitchAccount: string; matchId: number }>;
	castedMatches: Array<{ twitchAccount: string; matchId: number }>;
	castedMatchHistory?: Array<{
		twitchAccount: string;
		matchId: number;
		timestamp: number;
	}>;
};

function parseJson<T>(value: string | null): T | null {
	return value ? (JSON.parse(value) as T) : null;
}

function mergedCastTwitchAccounts(
	signup: { castTwitchAccounts: string | null },
	divisions: Array<{ castTwitchAccounts: string[] | null }>,
) {
	const accounts = new Set([
		...(parseJson<string[]>(signup.castTwitchAccounts) ?? []),
		...divisions.flatMap((division) => division.castTwitchAccounts ?? []),
	]);

	return accounts.size > 0 ? JSON.stringify([...accounts]) : null;
}

function mergedCastedMatchesInfo(
	signup: { castedMatchesInfo: string | null },
	divisions: Array<{ castedMatchesInfo: CastedMatchesInfo | null }>,
) {
	const infos = [
		parseJson<CastedMatchesInfo>(signup.castedMatchesInfo),
		...divisions.map((division) => division.castedMatchesInfo),
	].filter((info) => info !== null);

	if (infos.length === 0) return null;

	const castedMatchHistory = infos.flatMap(
		(info) => info.castedMatchHistory ?? [],
	);

	return JSON.stringify({
		castedMatches: infos.flatMap((info) => info.castedMatches),
		lockedMatches: infos.flatMap((info) => info.lockedMatches),
		castedMatchHistory:
			castedMatchHistory.length > 0 ? castedMatchHistory : undefined,
	});
}

function bestTier(divisions: Array<{ tier: number | null }>) {
	const tiers = divisions
		.map((division) => division.tier)
		.filter((tier) => tier !== null);

	return tiers.length > 0 ? Math.min(...tiers) : null;
}

/** Unix timestamp of the Monday (UTC) starting the given ISO week. Same as `weekNumberToDate`. */
function weekNumberToTimestamp({ week, year }: { week: number; year: number }) {
	const date = new Date(Date.UTC(year, 0, 4));
	date.setUTCDate(
		date.getUTCDate() - (date.getUTCDay() || 7) + 1 + 7 * (week - 1),
	);

	return Math.floor(date.getTime() / 1000);
}

function createDivisionTierTable(trx: Transaction<any>) {
	return (
		trx.schema
			.createTable("TournamentDivisionTier")
			.addColumn("tournamentId", "integer", (col) =>
				col.notNull().references("Tournament.id").onDelete("cascade"),
			)
			.addColumn("bracketIdx", "integer", (col) => col.notNull())
			.addColumn("tier", "integer", (col) => col.notNull())
			.addPrimaryKeyConstraint("tournament_division_tier_pk", [
				"tournamentId",
				"bracketIdx",
			])
			// every table in this schema is strict
			.modifyEnd(sql`strict`)
			.execute()
	);
}

/**
 * Gives every division (= starting bracket) a tier of its own, so that a result of a tournament
 * with many starting brackets stops showing the tier of its strongest division. Tournaments that
 * already got their divisions tiered, i.e. the leagues above, are left alone.
 *
 * Historical tiers can't be recomputed exactly: `SeedingSkill` only keeps current values and skill
 * inflates over time, so recomputing a finalized single division tournament lands on its stored tier
 * only about half of the time and is 1-3 tiers too good otherwise. Every division of one tournament
 * shares that drift, so they are recomputed as one batch and then shifted to make the first starting
 * bracket (the one the stored tier was calculated from) land exactly on it. Divisions of tournaments
 * with no tier are left out, having nothing to anchor to.
 */
async function backfillDivisionTiers(trx: Transaction<any>) {
	const alreadyTiered = new Set(
		(
			await trx
				.selectFrom("TournamentDivisionTier")
				.select("tournamentId")
				.distinct()
				.execute()
		).map((row: { tournamentId: number }) => row.tournamentId),
	);

	const tournaments = await trx
		.selectFrom("Tournament")
		.select(["id", "settings", "tier"])
		.where("tier", "is not", null)
		.execute();

	for (const tournament of tournaments) {
		if (alreadyTiered.has(tournament.id)) continue;

		const settings = JSON.parse(tournament.settings);
		const startingBracketIdxs = (settings.bracketProgression as any[])
			.map((bracket, idx) => ({ bracket, idx }))
			.filter(({ bracket }) => !bracket.sources)
			.map(({ idx }) => idx);

		// tournaments where every team plays the same bracket already have an accurate tier
		if (startingBracketIdxs.length < 2) continue;

		const teams = await teamsWithSeedingSkill(trx, {
			tournamentId: tournament.id,
			isRanked: settings.isRanked === true,
		});

		const tierByBracketIdx = new Map<number, number>();
		for (const bracketIdx of startingBracketIdxs) {
			const ofDivision = teams.filter(
				(team) => (team.startingBracketIdx ?? 0) === bracketIdx,
			);
			// teams that did not check in do not play the bracket, but tournaments predating
			// check-in data have none of them
			const checkedIn = ofDivision.filter((team) => team.checkedIn);

			const tier = tierOfTeams(checkedIn.length > 0 ? checkedIn : ofDivision);
			if (tier !== null) {
				tierByBracketIdx.set(bracketIdx, tier);
			}
		}

		const anchorTier = tierByBracketIdx.get(startingBracketIdxs[0]);
		if (anchorTier === undefined) continue;

		const offset = tournament.tier - anchorTier;

		await trx
			.insertInto("TournamentDivisionTier")
			.values(
				[...tierByBracketIdx].map(([bracketIdx, tier]) => ({
					tournamentId: tournament.id,
					bracketIdx,
					tier: clampTier(tier + offset),
				})),
			)
			.execute();
	}
}

function teamsWithSeedingSkill(
	trx: Transaction<any>,
	{ tournamentId, isRanked }: { tournamentId: number; isRanked: boolean },
): Promise<
	Array<{
		startingBracketIdx: number | null;
		avgOrdinal: number | null;
		checkedIn: number;
	}>
> {
	return trx
		.selectFrom("TournamentTeam")
		.select((eb) => [
			"TournamentTeam.startingBracketIdx",
			eb
				.selectFrom("TournamentTeamMember")
				.innerJoin("SeedingSkill", (join) =>
					join
						.onRef("SeedingSkill.userId", "=", "TournamentTeamMember.userId")
						.on("SeedingSkill.type", "=", isRanked ? "RANKED" : "UNRANKED"),
				)
				.select(({ fn }) => fn.avg("SeedingSkill.ordinal").as("v"))
				.whereRef(
					"TournamentTeamMember.tournamentTeamId",
					"=",
					"TournamentTeam.id",
				)
				.as("avgOrdinal"),
			eb
				.exists(
					eb
						.selectFrom("TournamentTeamCheckIn")
						.select("TournamentTeamCheckIn.tournamentTeamId")
						.whereRef(
							"TournamentTeamCheckIn.tournamentTeamId",
							"=",
							"TournamentTeam.id",
						)
						.where("TournamentTeamCheckIn.isCheckOut", "=", 0),
				)
				.as("checkedIn"),
		])
		.where("TournamentTeam.tournamentId", "=", tournamentId)
		.where("TournamentTeam.isPlaceholder", "=", 0)
		.execute() as any;
}

// frozen copy of app/features/tournament/core/tiering.ts as of this migration
const TIER_THRESHOLDS: Array<[tier: number, threshold: number]> = [
	[1, 32],
	[2, 29],
	[3, 26],
	[4, 24],
	[5, 21],
	[6, 15],
	[7, 10],
	[8, 5],
];
const WORST_TIER = 9;
const TOP_TEAMS_COUNT = 8;
const MIN_TEAMS_FOR_TIERING = 8;
const NO_BONUS_ABOVE = 32;
const MAX_BONUS_PER_10_TEAMS = 1.5;

function tierOfTeams(teams: Array<{ avgOrdinal: number | null }>) {
	if (teams.length < MIN_TEAMS_FOR_TIERING) return null;

	const ordinals = teams
		.map((team) => team.avgOrdinal)
		.filter((ordinal) => ordinal !== null);
	if (ordinals.length === 0) return null;

	const topOrdinals = ordinals.sort((a, b) => b - a).slice(0, TOP_TEAMS_COUNT);
	const rawScore =
		topOrdinals.reduce((sum, ordinal) => sum + ordinal, 0) / topOrdinals.length;

	const scaleFactor = Math.max(0, (NO_BONUS_ABOVE - rawScore) / NO_BONUS_ABOVE);
	const teamsAboveMin = Math.max(0, teams.length - MIN_TEAMS_FOR_TIERING);
	const adjustedScore =
		rawScore + scaleFactor * MAX_BONUS_PER_10_TEAMS * (teamsAboveMin / 10);

	for (const [tier, threshold] of TIER_THRESHOLDS) {
		if (adjustedScore >= threshold) return tier;
	}

	return WORST_TIER;
}

const clampTier = (tier: number) => Math.min(WORST_TIER, Math.max(1, tier));
