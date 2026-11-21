import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import { createStartedLanTournament } from "../tests/fixtures";
import * as EtaSimulation from "./EtaSimulation";
import * as StationsBoard from "./StationsBoard";

const users = UserFactory.pool();

const createTournament = () =>
	createStartedLanTournament({
		authorId: users.id(1),
		teamRosters: R.chunk(users.ids().slice(1), 4),
	});

const NOW = Date.UTC(2026, 10, 14, 12);

const buildBoard = async (tournamentId: number) => {
	const tournament = await tournamentFromDB(tournamentId);
	const stations =
		await TournamentStationRepository.findAllByTournamentId(tournamentId);
	const placements =
		await TournamentStationRepository.findMatchPlacementsByTournamentId(
			tournamentId,
		);

	return StationsBoard.build({
		tournament,
		stations,
		placements,
		matchStarts: EtaSimulation.simulate({
			tournament,
			stationIds: stations.map((station) => station.id),
			placements,
			now: NOW,
		}).matchStarts,
		now: NOW,
	});
};

describe("StationsBoard.build", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("puts playable matches on no station in the Waiting lane", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createTournament();
		await TournamentMatchStationFactory.create({ matchId: first, stationId });

		const board = await buildBoard(tournamentId);

		expect(board.waiting.map((match) => match.id)).toEqual([second]);
		expect(board.waiting[0]).toMatchObject({
			isPlayable: true,
			teams: [{ name: expect.any(String) }, { name: expect.any(String) }],
		});
	});

	test("marks the first playable queued match now and the following one next", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first],
			finalId,
		} = await createTournament();
		await TournamentMatchStationFactory.create({ matchId: finalId, stationId });
		await TournamentMatchStationFactory.create({ matchId: first, stationId });

		const board = await buildBoard(tournamentId);

		expect(board.stations[0].matches).toMatchObject([
			{ id: finalId, slot: "NEXT", isPlayable: false, teams: [null, null] },
			{ id: first, slot: "NOW", isPlayable: true },
		]);
	});

	test("shows when the matches not played now are expected to start", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament();
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		await TournamentMatchStationFactory.create({ matchId: finalId, stationId });

		const board = await buildBoard(tournamentId);
		const [now, next] = board.stations[0].matches;

		expect(now).toMatchObject({ id: first, startsIn: null });
		expect(next.id).toBe(finalId);
		expect(next.startsIn?.min).toBeGreaterThan(0);
		expect(board.waiting).toMatchObject([
			{ id: second, startsIn: { min: 0, max: 0 } },
		]);
	});

	test("leaves finished matches off the board", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament();
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		await TournamentMatchStationFactory.create({ matchId: finalId, stationId });
		await TournamentFactory.playMatches(tournamentId, {
			matchIds: [first, second],
		});

		const board = await buildBoard(tournamentId);

		expect(board.stations[0].matches).toMatchObject([
			{ id: finalId, slot: "NOW", isPlayable: true },
		]);
		expect(board.waiting).toEqual([]);
	});
});
