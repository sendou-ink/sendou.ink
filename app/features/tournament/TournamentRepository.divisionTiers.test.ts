import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "./TournamentRepository.server";

const users = UserFactory.pool();
const authorId = () => users.id(1);

describe("TournamentRepository.upsertDivisionTier", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	const createTournament = async () => {
		const { id } = await TournamentFactory.create({ authorId: authorId() });

		return id;
	};

	const tierOf = async (tournamentId: number) =>
		(await TournamentRepository.findById(tournamentId))?.tier;

	test("gives the tournament the tier of its only division", async () => {
		const tournamentId = await createTournament();

		await TournamentRepository.upsertDivisionTier({
			tournamentId,
			bracketIdx: 0,
			tier: 4,
		});

		expect(await tierOf(tournamentId)).toBe(4);
	});

	test("gives the tournament the best tier of its divisions", async () => {
		const tournamentId = await createTournament();

		await TournamentRepository.upsertDivisionTier({
			tournamentId,
			bracketIdx: 0,
			tier: 3,
		});
		await TournamentRepository.upsertDivisionTier({
			tournamentId,
			bracketIdx: 2,
			tier: 7,
		});

		expect(await tierOf(tournamentId)).toBe(3);
	});

	test("keeps the best tier when a stronger division is tiered last", async () => {
		const tournamentId = await createTournament();

		await TournamentRepository.upsertDivisionTier({
			tournamentId,
			bracketIdx: 0,
			tier: 7,
		});
		await TournamentRepository.upsertDivisionTier({
			tournamentId,
			bracketIdx: 2,
			tier: 3,
		});

		expect(await tierOf(tournamentId)).toBe(3);
	});

	// a replaced tier stops counting: the tournament would still be tier 3 if the row was kept
	test("replaces the tier of a division that is tiered again", async () => {
		const tournamentId = await createTournament();

		await TournamentRepository.upsertDivisionTier({
			tournamentId,
			bracketIdx: 0,
			tier: 3,
		});
		await TournamentRepository.upsertDivisionTier({
			tournamentId,
			bracketIdx: 2,
			tier: 6,
		});
		await TournamentRepository.upsertDivisionTier({
			tournamentId,
			bracketIdx: 0,
			tier: 8,
		});

		expect(await tierOf(tournamentId)).toBe(6);
	});
});
