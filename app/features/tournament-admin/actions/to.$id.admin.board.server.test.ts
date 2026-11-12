import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as TournamentStaffFactory from "~/db/seed/factories/TournamentStaffFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentAuditLogRepository from "~/features/tournament/TournamentAuditLogRepository.server";
import { clearTournamentDataCache } from "~/features/tournament-bracket/core/Tournament.server";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import { createStartedLanTournament } from "~/features/tournament-stations/tests/fixtures";
import type { stationsBoardActionSchema } from "~/features/tournament-stations/tournament-stations-schemas";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { action } from "./to.$id.admin.board.server";

const boardAction = wrappedAction<typeof stationsBoardActionSchema>({
	action,
});

const users = UserFactory.pool();
const organizerId = () => users.id(1);
const staffId = () => users.id(18);

const createTournament = async () => {
	const tournament = await createStartedLanTournament({
		authorId: organizerId(),
		teamRosters: R.chunk(users.ids(17).slice(1), 4),
	});

	return { ...tournament, params: { id: String(tournament.tournamentId) } };
};

const addStaff = async (
	tournamentId: number,
	role: "STREAMER" | "POOL_CAPTAIN",
) => {
	await TournamentStaffFactory.create({
		tournamentId,
		userId: staffId(),
		role,
	});
	clearTournamentDataCache(tournamentId);
};

const auditLogMetadata = async (tournamentId: number) =>
	(
		await TournamentAuditLogRepository.findByTournamentId({
			tournamentId,
			type: "MATCH_STATION_CHANGED",
			limit: 10,
			offset: 0,
		})
	).map((event) => ({ actorId: event.actor?.id, ...event.metadata }));

const queuedMatches = (tournamentId: number) =>
	TournamentStationRepository.findQueuedMatchesByTournamentId(tournamentId);

describe("stations board action", () => {
	beforeEach(async () => {
		await users.create(18);
	});

	test("puts the match on the station", async () => {
		const {
			tournamentId,
			params,
			stationIds: [stationId],
			semifinalIds: [matchId],
		} = await createTournament();

		await boardAction(
			{ _action: "MOVE_MATCH", matchId, stationId, index: 0 },
			{ user: organizerId(), params },
		);

		expect(await queuedMatches(tournamentId)).toEqual([{ matchId, stationId }]);
	});

	test("takes the match back to waiting when no station is given", async () => {
		const {
			tournamentId,
			params,
			stationIds: [stationId],
			semifinalIds: [matchId],
		} = await createTournament();
		await boardAction(
			{ _action: "MOVE_MATCH", matchId, stationId, index: 0 },
			{ user: organizerId(), params },
		);

		await boardAction(
			{ _action: "MOVE_MATCH", matchId, index: 0 },
			{ user: organizerId(), params },
		);

		expect(await queuedMatches(tournamentId)).toEqual([]);
	});

	test("logs a change of station to the audit log", async () => {
		const {
			tournamentId,
			params,
			stationIds: [stationId],
			semifinalIds: [matchId],
		} = await createTournament();
		await boardAction(
			{ _action: "MOVE_MATCH", matchId, stationId, index: 0 },
			{ user: organizerId(), params },
		);
		await boardAction(
			{ _action: "MOVE_MATCH", matchId, index: 0 },
			{ user: organizerId(), params },
		);

		expect(await auditLogMetadata(tournamentId)).toEqual([
			{
				actorId: organizerId(),
				matchName: "Semis 1",
				fromStationName: "Station 1",
				toStationName: null,
			},
			{
				actorId: organizerId(),
				matchName: "Semis 1",
				fromStationName: null,
				toStationName: "Station 1",
			},
		]);
	});

	test("doesn't log reordering a station's queue", async () => {
		const {
			tournamentId,
			params,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createTournament();
		await TournamentMatchStationFactory.create({ matchId: first, stationId });
		await TournamentMatchStationFactory.create({ matchId: second, stationId });

		await boardAction(
			{ _action: "MOVE_MATCH", matchId: second, stationId, index: 0 },
			{ user: organizerId(), params },
		);

		expect(await queuedMatches(tournamentId)).toEqual([
			{ matchId: second, stationId },
			{ matchId: first, stationId },
		]);
		expect(await auditLogMetadata(tournamentId)).toEqual([]);
	});

	test("lets a streamer move matches", async () => {
		const {
			tournamentId,
			params,
			stationIds: [stationId],
			semifinalIds: [matchId],
		} = await createTournament();
		await addStaff(tournamentId, "STREAMER");

		await boardAction(
			{ _action: "MOVE_MATCH", matchId, stationId, index: 0 },
			{ user: staffId(), params },
		);

		expect(await queuedMatches(tournamentId)).toHaveLength(1);
	});

	test("rejects a pool captain", async () => {
		const {
			tournamentId,
			params,
			stationIds: [stationId],
			semifinalIds: [matchId],
		} = await createTournament();
		await addStaff(tournamentId, "POOL_CAPTAIN");

		const res = await boardAction(
			{ _action: "MOVE_MATCH", matchId, stationId, index: 0 },
			{ user: staffId(), params },
		);

		assertResponseErrored(
			res,
			"Only organizers and streamers can move matches",
		);
		expect(await queuedMatches(tournamentId)).toEqual([]);
	});

	test("rejects another tournament's station", async () => {
		const {
			params,
			semifinalIds: [matchId],
		} = await createTournament();
		const {
			tournamentId: otherTournamentId,
			stationIds: [otherStationId],
		} = await createTournament();

		const res = await boardAction(
			{ _action: "MOVE_MATCH", matchId, stationId: otherStationId, index: 0 },
			{ user: organizerId(), params },
		);

		assertResponseErrored(res, "Unknown station");
		expect(await queuedMatches(otherTournamentId)).toEqual([]);
	});

	test("rejects a finished match", async () => {
		const {
			tournamentId,
			params,
			stationIds: [stationId],
			semifinalIds: [matchId],
		} = await createTournament();
		await TournamentFactory.playMatches(tournamentId, { matchIds: [matchId] });

		const res = await boardAction(
			{ _action: "MOVE_MATCH", matchId, stationId, index: 0 },
			{ user: organizerId(), params },
		);

		assertResponseErrored(res, "Match not found or already finished");
	});
});
