import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { TournamentSummary } from "../tournament-bracket/core/summarizer.server";
import * as TournamentRepository from "./TournamentRepository.server";
import * as TournamentTeamRepository from "./TournamentTeamRepository.server";

/** SQLite binds at most 32,766 parameters per statement and `PlayerResult` has eight columns. */
const PLAYER_RESULT_ROWS_PER_STATEMENT = Math.floor(32766 / 8);

/** Enough that every ordered pair, for both types, is over {@link PLAYER_RESULT_ROWS_PER_STATEMENT}. */
const USER_COUNT = 46;

const users = UserFactory.pool();

const createTournament = () =>
	TournamentFactory.create({ authorId: users.id(1) });

const emptySummary = (
	skills: TournamentSummary["skills"],
): TournamentSummary => ({
	skills,
	seedingSkills: [],
	mapResultDeltas: [],
	playerResultDeltas: [],
	tournamentResults: [],
	setResults: new Map(),
});

/** Puts a skill on record for season 0, the way the season's own tournaments did. */
const finalizePriorSeason = async (
	skill: TournamentSummary["skills"][number],
) => {
	const { id: tournamentId } = await createTournament();

	await TournamentRepository.finalize({
		tournamentId,
		season: 0,
		summary: emptySummary([skill]),
	});
};

/** Every ordered pair of the given users, once as mates and once as enemies. */
const playerResultDeltasForEveryPair = (
	userIds: number[],
): TournamentSummary["playerResultDeltas"] => {
	const deltas: TournamentSummary["playerResultDeltas"] = [];

	for (const type of ["MATE", "ENEMY"] as const) {
		for (const ownerUserId of userIds) {
			for (const otherUserId of userIds) {
				if (ownerUserId === otherUserId) continue;

				deltas.push({
					ownerUserId,
					otherUserId,
					mapWins: 1,
					mapLosses: 0,
					setWins: 1,
					setLosses: 0,
					type,
				});
			}
		}
	}

	return deltas;
};

describe("TournamentRepository.finalize", () => {
	beforeEach(async () => {
		// the "1-2-3-4" team identifier the tests use needs users 1-4 to be real ones
		await users.create(USER_COUNT);
	});

	test("matchesCount on a new season's Skill row does not include prior seasons", async () => {
		await finalizePriorSeason({
			userId: users.id(1),
			identifier: null,
			mu: 25,
			sigma: 8.333,
			matchesCount: 100,
		});

		const { id: tournamentId } = await createTournament();

		await TournamentRepository.finalize({
			tournamentId,
			season: 1,
			summary: emptySummary([
				{
					userId: users.id(1),
					identifier: null,
					mu: 25,
					sigma: 8.333,
					matchesCount: 5,
				},
			]),
		});

		const inserted = await db
			.selectFrom("Skill")
			.select("matchesCount")
			.where("userId", "=", users.id(1))
			.where("season", "=", 1)
			.executeTakeFirstOrThrow();

		expect(inserted.matchesCount).toBe(5);
	});

	test("team matchesCount on a new season's Skill row does not include prior seasons", async () => {
		await finalizePriorSeason({
			userId: null,
			identifier: "1-2-3-4",
			mu: 25,
			sigma: 8.333,
			matchesCount: 100,
		});

		const { id: tournamentId } = await createTournament();

		await TournamentRepository.finalize({
			tournamentId,
			season: 1,
			summary: emptySummary([
				{
					userId: null,
					identifier: "1-2-3-4",
					mu: 25,
					sigma: 8.333,
					matchesCount: 5,
				},
			]),
		});

		const inserted = await db
			.selectFrom("Skill")
			.select("matchesCount")
			.where("identifier", "=", "1-2-3-4")
			.where("season", "=", 1)
			.executeTakeFirstOrThrow();

		expect(inserted.matchesCount).toBe(5);
	});

	test("finalizes and records placements when season is undefined (between-seasons tournament)", async () => {
		await finalizePriorSeason({
			userId: users.id(1),
			identifier: null,
			mu: 25,
			sigma: 8.333,
			matchesCount: 100,
		});

		const { id: tournamentId } = await createTournament();
		const { id: tournamentTeamId } = await TournamentTeamFactory.create({
			tournamentId,
			memberUserIds: [users.id(1)],
		});

		await TournamentRepository.finalize({
			tournamentId,
			season: undefined,
			summary: {
				skills: [],
				seedingSkills: [],
				mapResultDeltas: [],
				playerResultDeltas: [],
				tournamentResults: [
					{
						userId: users.id(1),
						placement: 1,
						participantCount: 1,
						tournamentTeamId,
						div: null,
					},
				],
				setResults: new Map([[1, ["W"]]]),
			},
		});

		const tournament = await db
			.selectFrom("Tournament")
			.select("isFinalized")
			.where("id", "=", tournamentId)
			.executeTakeFirstOrThrow();
		const newSkills = await db
			.selectFrom("Skill")
			.select("id")
			.where("tournamentId", "=", tournamentId)
			.execute();
		const placement = await db
			.selectFrom("TournamentResult")
			.select("placement")
			.where("tournamentId", "=", tournamentId)
			.where("userId", "=", users.id(1))
			.executeTakeFirstOrThrow();

		expect(tournament.isFinalized).toBe(1);
		expect(newSkills).toHaveLength(0);
		expect(placement.placement).toBe(1);
	});

	test("matchesCount accumulates across tournaments within the same season", async () => {
		const { id: firstTournamentId } = await createTournament();
		await TournamentRepository.finalize({
			tournamentId: firstTournamentId,
			season: 1,
			summary: emptySummary([
				{
					userId: users.id(1),
					identifier: null,
					mu: 25,
					sigma: 8.333,
					matchesCount: 5,
				},
			]),
		});

		const { id: secondTournamentId } = await createTournament();
		await TournamentRepository.finalize({
			tournamentId: secondTournamentId,
			season: 1,
			summary: emptySummary([
				{
					userId: users.id(1),
					identifier: null,
					mu: 25,
					sigma: 8.333,
					matchesCount: 3,
				},
			]),
		});

		const second = await db
			.selectFrom("Skill")
			.select("matchesCount")
			.where("userId", "=", users.id(1))
			.where("tournamentId", "=", secondTournamentId)
			.executeTakeFirstOrThrow();

		expect(second.matchesCount).toBe(8);
	});

	test("finalizes a tournament with more player result deltas than fit in one insert statement", async () => {
		const { id: tournamentId } = await createTournament();
		const playerResultDeltas = playerResultDeltasForEveryPair(users.ids());

		expect(playerResultDeltas.length).toBeGreaterThan(
			PLAYER_RESULT_ROWS_PER_STATEMENT,
		);

		await TournamentRepository.finalize({
			tournamentId,
			season: 1,
			summary: { ...emptySummary([]), playerResultDeltas },
		});

		const inserted = await db
			.selectFrom("PlayerResult")
			.select(({ fn }) => fn.countAll<number>().as("count"))
			.where("season", "=", 1)
			.executeTakeFirstOrThrow();

		expect(inserted.count).toBe(playerResultDeltas.length);
	});

	describe("trophy of a tournament with many divisions", () => {
		const TOP_DIVISION_TIER = 2;
		const LOW_DIVISION_TIER = 7;

		const finalizeWithTrophyWonBy = async ({
			startingBracketIdx,
			divisionTiers = true,
		}: {
			startingBracketIdx: number;
			divisionTiers?: boolean;
		}) => {
			const { id: tournamentId } = await TournamentFactory.create(
				{ authorId: users.id(1) },
				{ tier: TOP_DIVISION_TIER },
			);
			const trophy = await TrophyFactory.create();
			const { id: tournamentTeamId } = await TournamentTeamFactory.create({
				tournamentId,
				memberUserIds: [users.id(1)],
			});

			await TournamentTeamRepository.updateStartingBrackets([
				{ tournamentTeamId, startingBracketIdx },
			]);
			if (divisionTiers) {
				await TournamentRepository.upsertDivisionTier({
					tournamentId,
					bracketIdx: 1,
					tier: LOW_DIVISION_TIER,
				});
			}

			await TournamentRepository.finalize({
				tournamentId,
				season: undefined,
				summary: {
					...emptySummary([]),
					tournamentResults: [
						{
							userId: users.id(1),
							placement: 1,
							participantCount: 1,
							tournamentTeamId,
							div: null,
						},
					],
					setResults: new Map([[users.id(1), ["W"]]]),
				},
				trophyReceiver: { trophyId: trophy.id, userIds: [users.id(1)] },
			});

			const owner = await db
				.selectFrom("TrophyOwner")
				.select("tier")
				.where("tournamentId", "=", tournamentId)
				.executeTakeFirstOrThrow();

			return owner.tier;
		};

		test("records the tier of the division it was won in", async () => {
			expect(await finalizeWithTrophyWonBy({ startingBracketIdx: 1 })).toBe(
				LOW_DIVISION_TIER,
			);
		});

		test("records the tournament's tier when the division has none", async () => {
			expect(
				await finalizeWithTrophyWonBy({
					startingBracketIdx: 1,
					divisionTiers: false,
				}),
			).toBe(TOP_DIVISION_TIER);
		});
	});
});
