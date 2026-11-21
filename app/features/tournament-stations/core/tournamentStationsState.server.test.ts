import * as R from "remeda";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import {
	createFinalizedLanTournament,
	createStartedLanTournament,
} from "../tests/fixtures";
import {
	clearTournamentStationsStateCache,
	tournamentStationsState,
} from "./tournamentStationsState.server";

const users = UserFactory.pool();

const createTournament = () =>
	createStartedLanTournament({
		authorId: users.id(1),
		teamRosters: R.chunk(users.ids().slice(1), 4),
		stationNames: ["Station 1"],
		autoAssign: false,
	});

describe("tournamentStationsState", () => {
	beforeEach(async () => {
		await users.create(17);
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("is null for an online tournament", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});

		expect(
			await tournamentStationsState(await tournamentFromDB(tournament.id)),
		).toBe(null);
	});

	test("reuses the estimates for the same tournament instance", async () => {
		const { tournamentId } = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);

		const first = await tournamentStationsState(tournament);

		expect(await tournamentStationsState(tournament)).toBe(first);
	});

	test("estimates again for a new tournament instance", async () => {
		const { tournamentId } = await createTournament();

		const first = await tournamentStationsState(
			await tournamentFromDB(tournamentId),
		);

		expect(
			await tournamentStationsState(await tournamentFromDB(tournamentId)),
		).not.toBe(first);
	});

	test("is null for a finalized tournament", async () => {
		const { tournamentId } = await createFinalizedLanTournament({
			authorId: users.id(1),
			teamRosters: R.chunk(users.ids().slice(1), 4),
		});

		expect(
			await tournamentStationsState(await tournamentFromDB(tournamentId)),
		).toBe(null);
	});

	test("keeps the estimates of each instance when two of them take turns", async () => {
		const { tournamentId } = await createTournament();
		const shared = await tournamentFromDB(tournamentId);
		const registryCopy = await tournamentFromDB(tournamentId);

		const sharedState = await tournamentStationsState(shared);
		const registryState = await tournamentStationsState(registryCopy);

		expect(await tournamentStationsState(shared)).toBe(sharedState);
		expect(await tournamentStationsState(registryCopy)).toBe(registryState);
	});

	test("estimates every instance again once cleared", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first],
		} = await createTournament();
		const shared = await tournamentFromDB(tournamentId);
		const registryCopy = await tournamentFromDB(tournamentId);
		await tournamentStationsState(shared);
		await tournamentStationsState(registryCopy);

		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		clearTournamentStationsStateCache(tournamentId);

		for (const instance of [shared, registryCopy]) {
			expect(
				(await tournamentStationsState(instance))?.stationByMatchId.get(first)
					?.id,
			).toBe(stationId);
		}
	});

	test("estimates again after a minute", async () => {
		const { tournamentId } = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);

		const first = await tournamentStationsState(tournament);
		vi.setSystemTime(new Date("2026-11-14T12:01:00Z"));

		expect(await tournamentStationsState(tournament)).not.toBe(first);
	});

	test("estimates again with the stations' new queues once cleared", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);

		const before = await tournamentStationsState(tournament);
		await TournamentMatchStationFactory.create({ matchId: second, stationId });
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		clearTournamentStationsStateCache(tournamentId);
		const after = await tournamentStationsState(tournament);

		// a lone station plays the semifinals in its queue's order
		expect(before?.etas.matchStarts.get(first)?.earliest).toBe(Date.now());
		expect(after?.etas.matchStarts.get(second)?.earliest).toBe(Date.now());
		expect(after?.etas.matchStarts.get(first)?.earliest).toBeGreaterThan(
			Date.now(),
		);
		expect(after?.stationByMatchId.get(first)?.id).toBe(stationId);
	});
});
