import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import { dbInsertUsers, dbReset } from "~/utils/Test";
import type { TournamentSummary } from "../core/summarizer.server";
import { addSummary } from "./addSummary.server";

const createTournament = () =>
	db
		.insertInto("Tournament")
		.values({
			mapPickingStyle: "TO",
			settings: JSON.stringify({ bracketProgression: [] }),
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const createTeam = (tournamentId: number) =>
	db
		.insertInto("TournamentTeam")
		.values({
			tournamentId,
			name: "team",
			inviteCode: `inv-${tournamentId}`,
		})
		.returning("id")
		.executeTakeFirstOrThrow();

const insertPriorSkill = (args: {
	userId: number;
	season: number;
	matchesCount: number;
}) =>
	db
		.insertInto("Skill")
		.values({
			userId: args.userId,
			season: args.season,
			matchesCount: args.matchesCount,
			mu: 25,
			sigma: 8.333,
			ordinal: 0,
		})
		.execute();

const emptySummary = (
	skills: TournamentSummary["skills"],
): TournamentSummary => ({
	skills,
	seedingSkills: [],
	mapResultDeltas: [],
	playerResultDeltas: [],
	tournamentResults: [],
	spDiffs: null,
	setResults: new Map(),
});

const insertPriorTeamSkill = (args: {
	identifier: string;
	season: number;
	matchesCount: number;
}) =>
	db
		.insertInto("Skill")
		.values({
			identifier: args.identifier,
			season: args.season,
			matchesCount: args.matchesCount,
			mu: 25,
			sigma: 8.333,
			ordinal: 0,
		})
		.execute();

describe("addSummary", () => {
	beforeEach(async () => {
		await dbInsertUsers(2);
	});
	afterEach(() => {
		dbReset();
	});

	test("matchesCount on a new season's Skill row does not include prior seasons", async () => {
		await insertPriorSkill({ userId: 1, season: 0, matchesCount: 100 });

		const { id: tournamentId } = await createTournament();

		addSummary({
			tournamentId,
			season: 1,
			summary: emptySummary([
				{
					userId: 1,
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
			.where("userId", "=", 1)
			.where("season", "=", 1)
			.executeTakeFirstOrThrow();

		expect(inserted.matchesCount).toBe(5);
	});

	test("team matchesCount on a new season's Skill row does not include prior seasons", async () => {
		await insertPriorTeamSkill({
			identifier: "1-2",
			season: 0,
			matchesCount: 100,
		});

		const { id: tournamentId } = await createTournament();

		addSummary({
			tournamentId,
			season: 1,
			summary: emptySummary([
				{
					userId: null,
					identifier: "1-2",
					mu: 25,
					sigma: 8.333,
					matchesCount: 5,
				},
			]),
		});

		const inserted = await db
			.selectFrom("Skill")
			.select("matchesCount")
			.where("identifier", "=", "1-2")
			.where("season", "=", 1)
			.executeTakeFirstOrThrow();

		expect(inserted.matchesCount).toBe(5);
	});

	test("finalizes and records placements when season is undefined (between-seasons tournament)", async () => {
		await insertPriorSkill({ userId: 1, season: 0, matchesCount: 100 });

		const { id: tournamentId } = await createTournament();
		const { id: tournamentTeamId } = await createTeam(tournamentId);

		addSummary({
			tournamentId,
			season: undefined,
			summary: {
				skills: [],
				seedingSkills: [],
				mapResultDeltas: [],
				playerResultDeltas: [],
				tournamentResults: [
					{
						userId: 1,
						placement: 1,
						participantCount: 1,
						tournamentTeamId,
						div: null,
					},
				],
				spDiffs: null,
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
			.where("userId", "=", 1)
			.executeTakeFirstOrThrow();

		expect(tournament.isFinalized).toBe(1);
		expect(newSkills).toHaveLength(0);
		expect(placement.placement).toBe(1);
	});

	test("matchesCount accumulates across tournaments within the same season", async () => {
		const { id: firstTournamentId } = await createTournament();
		addSummary({
			tournamentId: firstTournamentId,
			season: 1,
			summary: emptySummary([
				{
					userId: 1,
					identifier: null,
					mu: 25,
					sigma: 8.333,
					matchesCount: 5,
				},
			]),
		});

		const { id: secondTournamentId } = await createTournament();
		addSummary({
			tournamentId: secondTournamentId,
			season: 1,
			summary: emptySummary([
				{
					userId: 1,
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
			.where("userId", "=", 1)
			.where("tournamentId", "=", secondTournamentId)
			.executeTakeFirstOrThrow();

		expect(second.matchesCount).toBe(8);
	});
});
