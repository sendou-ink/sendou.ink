import * as R from "remeda";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { clearSentNotificationsForTesting } from "~/features/notifications/core/notify.server";
import * as NotificationRepository from "~/features/notifications/NotificationRepository.server";
import { notificationMeta } from "~/features/notifications/notifications-utils";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { createStartedLanTournament } from "../tests/fixtures";
import { autoAssignStations } from "./autoAssignStations.server";
import {
	clearStationNotificationsForTesting,
	STATION_NOTIFICATION_DELAY_MS,
} from "./stationNotifications.server";
import { tournamentStationsState } from "./tournamentStationsState.server";

const users = UserFactory.pool();
/** Plays the first semifinal (seed 1 vs 4): the second team of the pool. */
const firstSemifinalPlayerId = () => users.id(2);
/** Plays the second semifinal (seed 2 vs 3). */
const secondSemifinalPlayerId = () => users.id(6);

const createTournament = (
	args: Partial<Parameters<typeof createStartedLanTournament>[0]> = {},
) =>
	createStartedLanTournament({
		authorId: users.id(1),
		teamRosters: R.chunk(users.ids().slice(1), 4),
		...args,
	});

const update = async (tournamentId: number) =>
	autoAssignStations(await tournamentFromDB(tournamentId));

const notificationsOf = async (userId: number) =>
	(await NotificationRepository.findByUserId(userId)).map((notification) => ({
		type: notification.type,
		meta: notificationMeta(notification),
	}));

describe("updateStationNotifications", () => {
	beforeEach(async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
		clearSentNotificationsForTesting();
		clearStationNotificationsForTesting();
		await users.create(17);
	});

	afterEach(() => {
		clearStationNotificationsForTesting();
		vi.useRealTimers();
	});

	test("notifies the teams once their match has stayed on its station", async () => {
		const {
			tournamentId,
			semifinalIds: [first],
		} = await createTournament();

		await update(tournamentId);
		expect(await notificationsOf(firstSemifinalPlayerId())).toEqual([]);

		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(await notificationsOf(firstSemifinalPlayerId())).toEqual([
			{
				type: "TO_MATCH_STATION_ASSIGNED",
				meta: expect.objectContaining({ matchId: first, station: "Station 1" }),
			},
		]);
		expect(await notificationsOf(secondSemifinalPlayerId())).toEqual([
			{
				type: "TO_MATCH_STATION_ASSIGNED",
				meta: expect.objectContaining({ station: "Station 2" }),
			},
		]);
	});

	test("waits the full delay again after the match is moved to another station", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId, secondStationId],
			semifinalIds: [first],
		} = await createTournament({ autoAssign: false });
		const moveTo = async (stationId: number) => {
			await TournamentMatchStationFactory.create({
				matchId: first,
				stationId,
				index: 0,
			});
			await update(tournamentId);
		};

		await moveTo(firstStationId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS / 2);
		await moveTo(secondStationId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS / 2);
		expect(await notificationsOf(firstSemifinalPlayerId())).toEqual([]);

		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS / 2);
		expect(await notificationsOf(firstSemifinalPlayerId())).toEqual([
			{
				type: "TO_MATCH_STATION_ASSIGNED",
				meta: expect.objectContaining({ station: "Station 2" }),
			},
		]);
	});

	test("drops the notification of a match taken back to Waiting before it was sent", async () => {
		const {
			tournamentId,
			semifinalIds: [first],
		} = await createTournament();
		await update(tournamentId);

		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS / 2);
		await TournamentMatchStationFactory.create({
			matchId: first,
			stationId: null,
			index: 0,
		});
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(await notificationsOf(firstSemifinalPlayerId())).toEqual([]);
		expect(await notificationsOf(secondSemifinalPlayerId())).toHaveLength(1);
	});

	test("tells the teams their match moved after they were notified", async () => {
		const {
			tournamentId,
			stationIds: [, , thirdStationId],
			semifinalIds: [first],
		} = await createTournament({
			stationNames: ["Station 1", "Station 2", "Station 3"],
		});
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		await TournamentMatchStationFactory.create({
			matchId: first,
			stationId: thirdStationId,
			index: 0,
		});
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(await notificationsOf(firstSemifinalPlayerId())).toEqual([
			{
				type: "TO_MATCH_STATION_MOVED",
				meta: expect.objectContaining({ station: "Station 3" }),
			},
			{
				type: "TO_MATCH_STATION_ASSIGNED",
				meta: expect.objectContaining({ station: "Station 1" }),
			},
		]);
	});

	test("notifies once even when the match stays on its station", async () => {
		const { tournamentId } = await createTournament();
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(await notificationsOf(firstSemifinalPlayerId())).toHaveLength(1);
	});

	test("notifies the next match on a lone station once the one before it is over", async () => {
		const {
			tournamentId,
			semifinalIds: [first],
		} = await createTournament({ stationNames: ["Main stage"] });
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);
		expect(await notificationsOf(secondSemifinalPlayerId())).toEqual([]);

		await TournamentFactory.playMatches(tournamentId, { matchIds: [first] });
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(await notificationsOf(secondSemifinalPlayerId())).toEqual([
			{
				type: "TO_MATCH_STATION_ASSIGNED",
				meta: expect.objectContaining({ station: "Main stage" }),
			},
		]);
	});

	test("tells the teams again each time their match moves, also to a station they were told before", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId, secondStationId],
			semifinalIds: [first],
		} = await createTournament({ autoAssign: false });

		for (const stationId of [
			firstStationId,
			secondStationId,
			firstStationId,
			secondStationId,
		]) {
			await TournamentMatchStationFactory.create({ matchId: first, stationId });
			await update(tournamentId);
			await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);
		}

		expect(
			(await notificationsOf(firstSemifinalPlayerId())).map(({ type }) => type),
		).toEqual([
			"TO_MATCH_STATION_MOVED",
			"TO_MATCH_STATION_MOVED",
			"TO_MATCH_STATION_MOVED",
			"TO_MATCH_STATION_ASSIGNED",
		]);
	});

	test("remembers the stations teams were told across a server restart", async () => {
		const {
			tournamentId,
			stationIds: [, , thirdStationId],
			semifinalIds: [first],
		} = await createTournament({
			stationNames: ["Station 1", "Station 2", "Station 3"],
		});
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		clearStationNotificationsForTesting();
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);
		expect(await notificationsOf(firstSemifinalPlayerId())).toHaveLength(1);

		clearStationNotificationsForTesting();
		await TournamentMatchStationFactory.create({
			matchId: first,
			stationId: thirdStationId,
		});
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(
			(await notificationsOf(firstSemifinalPlayerId())).map(({ type }) => type),
		).toEqual(["TO_MATCH_STATION_MOVED", "TO_MATCH_STATION_ASSIGNED"]);
	});

	test("sends a notice scheduled before a server restart once the tournament's stations are loaded again", async () => {
		const { tournamentId } = await createTournament();
		await update(tournamentId);

		clearStationNotificationsForTesting();
		await tournamentStationsState(await tournamentFromDB(tournamentId));
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(await notificationsOf(firstSemifinalPlayerId())).toHaveLength(1);
	});

	test("notifies a match queued behind another once it's next in line", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
		} = await createTournament({ autoAssign: false });
		for (const matchId of [first, second]) {
			await TournamentMatchStationFactory.create({ matchId, stationId });
		}
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);
		expect(await notificationsOf(firstSemifinalPlayerId())).toHaveLength(1);
		expect(await notificationsOf(secondSemifinalPlayerId())).toEqual([]);

		await TournamentFactory.playMatches(tournamentId, { matchIds: [first] });
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(await notificationsOf(secondSemifinalPlayerId())).toEqual([
			{
				type: "TO_MATCH_STATION_ASSIGNED",
				meta: expect.objectContaining({ station: "Station 1" }),
			},
		]);
	});

	test("notifies no one in a LAN without stations", async () => {
		const { tournamentId } = await createTournament({ stationNames: [] });
		await update(tournamentId);
		await vi.advanceTimersByTimeAsync(STATION_NOTIFICATION_DELAY_MS);

		expect(await notificationsOf(firstSemifinalPlayerId())).toEqual([]);
	});
});
