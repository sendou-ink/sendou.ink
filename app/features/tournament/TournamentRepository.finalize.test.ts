import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { db } from "~/db/sql";
import type { TournamentSummary } from "../tournament-bracket/core/summarizer.server";
import * as TournamentRepository from "./TournamentRepository.server";

let player: { id: number };

const createTournament = () =>
	TournamentFactory.create({ authorId: player.id });

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

describe("TournamentRepository.finalize", () => {
	beforeEach(async () => {
		// four users so that the "1-2-3-4" team identifier the tests use names real ones
		[player] = await UserFactory.createMany(4);
	});

	test("matchesCount on a new season's Skill row does not include prior seasons", async () => {
		await finalizePriorSeason({
			userId: player.id,
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
					userId: player.id,
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
			.where("userId", "=", player.id)
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
			userId: player.id,
			identifier: null,
			mu: 25,
			sigma: 8.333,
			matchesCount: 100,
		});

		const { id: tournamentId } = await createTournament();
		const { id: tournamentTeamId } = await TournamentTeamFactory.create({
			tournamentId,
			memberUserIds: [player.id],
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
						userId: player.id,
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
			.where("userId", "=", player.id)
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
					userId: player.id,
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
					userId: player.id,
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
			.where("userId", "=", player.id)
			.where("tournamentId", "=", secondTournamentId)
			.executeTakeFirstOrThrow();

		expect(second.matchesCount).toBe(8);
	});
});
