import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "../TournamentStationRepository.server";
import { createStartedLanTournament } from "../tests/fixtures";
import { autoAssignStations } from "./autoAssignStations.server";

const users = UserFactory.pool();

const createTournament = (
	args: Partial<Parameters<typeof createStartedLanTournament>[0]> = {},
) =>
	createStartedLanTournament({
		authorId: users.id(1),
		teamRosters: R.chunk(users.ids().slice(1), 4),
		...args,
	});

const assignAndRead = async (tournamentId: number) => {
	await autoAssignStations(await tournamentFromDB(tournamentId));

	return TournamentStationRepository.findMatchPlacementsByTournamentId(
		tournamentId,
	);
};

describe("autoAssignStations", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("puts the playable matches on the stations", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId, secondStationId],
			semifinalIds: [first, second],
		} = await createTournament();

		expect(await assignAndRead(tournamentId)).toEqual([
			{ matchId: first, stationId: firstStationId, isAutoAssigned: 1 },
			{ matchId: second, stationId: secondStationId, isAutoAssigned: 1 },
		]);
	});

	test("queues one match at a time on a lone station", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createTournament({ stationNames: ["Main stage"] });

		expect(await assignAndRead(tournamentId)).toEqual([
			{ matchId: first, stationId, isAutoAssigned: 1 },
		]);

		await TournamentFactory.playMatches(tournamentId, { matchIds: [first] });

		expect(await assignAndRead(tournamentId)).toEqual([
			{ matchId: first, stationId, isAutoAssigned: 1 },
			{ matchId: second, stationId, isAutoAssigned: 1 },
		]);
	});

	test("puts the final on a station a team just left", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId, secondStationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament({
			stationNames: ["Station 1", "Station 2", "Station 3"],
		});
		await assignAndRead(tournamentId);

		await TournamentFactory.playMatches(tournamentId, {
			matchIds: [first, second],
		});

		expect(await assignAndRead(tournamentId)).toEqual([
			{ matchId: first, stationId: firstStationId, isAutoAssigned: 1 },
			{ matchId: finalId, stationId: firstStationId, isAutoAssigned: 1 },
			{ matchId: second, stationId: secondStationId, isAutoAssigned: 1 },
		]);
	});

	test("puts a playable match in front of a match queued before its teams are known", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId, secondStationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament();
		await TournamentMatchStationFactory.create({
			matchId: finalId,
			stationId: firstStationId,
		});

		expect(await assignAndRead(tournamentId)).toEqual([
			{ matchId: first, stationId: firstStationId, isAutoAssigned: 1 },
			{ matchId: finalId, stationId: firstStationId, isAutoAssigned: 0 },
			{ matchId: second, stationId: secondStationId, isAutoAssigned: 1 },
		]);
	});

	test("does nothing in a tournament without stations", async () => {
		const { tournamentId } = await createTournament({ stationNames: [] });

		expect(await assignAndRead(tournamentId)).toEqual([]);
	});

	test("does nothing with auto-assignment turned off", async () => {
		const { tournamentId } = await createTournament({ autoAssign: false });

		expect(await assignAndRead(tournamentId)).toEqual([]);
	});
});
