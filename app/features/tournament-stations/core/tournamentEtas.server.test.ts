import * as R from "remeda";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { createStartedLanTournament } from "../tests/fixtures";
import {
	clearTournamentEtasCache,
	tournamentEtas,
} from "./tournamentEtas.server";

const users = UserFactory.pool();

const createTournament = () =>
	createStartedLanTournament({
		authorId: users.id(1),
		teamRosters: R.chunk(users.ids().slice(1), 4),
		stationNames: ["Station 1"],
		autoAssign: false,
	});

describe("tournamentEtas", () => {
	beforeEach(async () => {
		await users.create(17);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("estimates nothing for an online tournament", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});

		expect(await tournamentEtas(await tournamentFromDB(tournament.id))).toBe(
			null,
		);
	});

	test("reuses the estimates for the same tournament instance", async () => {
		const { tournamentId } = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);

		const first = await tournamentEtas(tournament);

		expect(await tournamentEtas(tournament)).toBe(first);
	});

	test("estimates again for a new tournament instance", async () => {
		const { tournamentId } = await createTournament();

		const first = await tournamentEtas(await tournamentFromDB(tournamentId));

		expect(await tournamentEtas(await tournamentFromDB(tournamentId))).not.toBe(
			first,
		);
	});

	test("estimates again after a minute", async () => {
		const { tournamentId } = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);

		const first = await tournamentEtas(tournament);
		vi.setSystemTime(new Date("2026-11-14T12:01:00Z"));

		expect(await tournamentEtas(tournament)).not.toBe(first);
	});

	test("estimates again with the stations' new queues once cleared", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);

		const before = await tournamentEtas(tournament);
		await TournamentMatchStationFactory.create({ matchId: second, stationId });
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		clearTournamentEtasCache(tournamentId);
		const after = await tournamentEtas(tournament);

		// a lone station plays the semifinals in its queue's order
		expect(before?.matchStarts.get(first)?.earliest).toBe(Date.now());
		expect(after?.matchStarts.get(second)?.earliest).toBe(Date.now());
		expect(after?.matchStarts.get(first)?.earliest).toBeGreaterThan(Date.now());
	});
});
