import type { Kysely, Transaction } from "kysely";

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

		for (const season of SEASONS) {
			await migrateSeason(trx, season);
		}

		await trx.schema
			.alterTable("Tournament")
			.dropColumn("parentTournamentId")
			.execute();
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
