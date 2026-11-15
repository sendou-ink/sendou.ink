import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { tournamentFromDB } from "~/features/tournament-bracket/core/Tournament.server";
import { createStartedLanTournament } from "../tests/fixtures";
import * as StationNotifications from "./StationNotifications";

const users = UserFactory.pool();

const createTournament = () =>
	createStartedLanTournament({
		authorId: users.id(1),
		teamRosters: R.chunk(users.ids().slice(1), 4),
		autoAssign: false,
	});

describe("StationNotifications.notices", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("notices playable matches on a station their teams weren't told", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);

		const notices = StationNotifications.notices({
			tournament,
			placements: [
				{ matchId: first, stationId: firstStationId },
				// not playable yet
				{ matchId: finalId, stationId: firstStationId },
				// held in Waiting
				{ matchId: second, stationId: null },
			],
			notifiedStations: [],
		});

		expect(notices).toEqual([
			{ matchId: first, stationId: firstStationId, previousStationId: null },
		]);
	});

	test("notices a match moved off the station its teams were told, not one still on it", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId, secondStationId],
			semifinalIds: [first, second],
		} = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);

		const notices = StationNotifications.notices({
			tournament,
			placements: [
				{ matchId: first, stationId: secondStationId },
				{ matchId: second, stationId: firstStationId },
			],
			notifiedStations: [
				{ matchId: first, stationId: firstStationId },
				{ matchId: second, stationId: firstStationId },
			],
		});

		expect(notices).toEqual([
			{
				matchId: first,
				stationId: secondStationId,
				previousStationId: firstStationId,
			},
		]);
	});

	test("notices only the first playable match of each station's queue", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first, second],
			finalId,
		} = await createTournament();

		const notices = StationNotifications.notices({
			tournament: await tournamentFromDB(tournamentId),
			placements: [
				// queued in front but not playable yet, doesn't hold the station
				{ matchId: finalId, stationId },
				{ matchId: second, stationId },
				// waits its turn behind the second semifinal
				{ matchId: first, stationId },
			],
			notifiedStations: [],
		});

		expect(notices).toEqual([
			{ matchId: second, stationId, previousStationId: null },
		]);
	});

	test("leaves out finished matches", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first],
		} = await createTournament();
		await TournamentFactory.playMatches(tournamentId, { matchIds: [first] });

		const notices = StationNotifications.notices({
			tournament: await tournamentFromDB(tournamentId),
			placements: [{ matchId: first, stationId }],
			notifiedStations: [],
		});

		expect(notices).toEqual([]);
	});
});

describe("StationNotifications.schedule", () => {
	const NOW = 1_000_000;
	const DELAY_MS = 20_000;
	const notice = { matchId: 1, stationId: 10, previousStationId: null };

	test.each([
		{
			why: "a new notice waits for the delay",
			current: [notice],
			scheduled: [],
			expected: { due: [], scheduled: [{ ...notice, dueAt: NOW + DELAY_MS }] },
		},
		{
			why: "a notice for the same station keeps its time",
			current: [notice],
			scheduled: [{ ...notice, dueAt: NOW + 5_000 }],
			expected: { due: [], scheduled: [{ ...notice, dueAt: NOW + 5_000 }] },
		},
		{
			why: "a notice whose time has come is due",
			current: [notice],
			scheduled: [{ ...notice, dueAt: NOW }],
			expected: { due: [notice], scheduled: [] },
		},
		{
			why: "a match moved to another station waits again",
			current: [{ ...notice, stationId: 11 }],
			scheduled: [{ ...notice, dueAt: NOW }],
			expected: {
				due: [],
				scheduled: [{ ...notice, stationId: 11, dueAt: NOW + DELAY_MS }],
			},
		},
		{
			why: "a notice no longer current is dropped",
			current: [],
			scheduled: [{ ...notice, dueAt: NOW }],
			expected: { due: [], scheduled: [] },
		},
	])("$why", ({ current, scheduled, expected }) => {
		expect(
			StationNotifications.schedule({
				current,
				scheduled,
				now: NOW,
				delayMs: DELAY_MS,
			}),
		).toEqual(expected);
	});
});

describe("StationNotifications.notifications", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("tells each team its station and opponent", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first],
		} = await createTournament();
		const tournament = await tournamentFromDB(tournamentId);
		const match = tournament.brackets[0].data.match.find(
			(candidate) => candidate.id === first,
		)!;
		const [team1, team2] = [match.opponent1!.id!, match.opponent2!.id!].map(
			(teamId) => tournament.teamById(teamId)!,
		);

		const notifications = StationNotifications.notifications({
			tournament,
			notice: { matchId: first, stationId, previousStationId: null },
			station: { name: "Station 3", locationNote: "north corner" },
		});

		expect(notifications).toEqual([
			{
				userIds: team1.memberUserIds,
				notification: expect.objectContaining({
					type: "TO_MATCH_STATION_ASSIGNED",
					meta: expect.objectContaining({
						matchId: first,
						station: "Station 3 (north corner)",
						opponentTeamName: team2.name,
					}),
				}),
			},
			{
				userIds: team2.memberUserIds,
				notification: expect.objectContaining({
					meta: expect.objectContaining({ opponentTeamName: team1.name }),
				}),
			},
		]);
	});

	test("tells the teams their match moved", async () => {
		const {
			tournamentId,
			stationIds: [firstStationId, secondStationId],
			semifinalIds: [first],
		} = await createTournament();

		const notifications = StationNotifications.notifications({
			tournament: await tournamentFromDB(tournamentId),
			notice: {
				matchId: first,
				stationId: secondStationId,
				previousStationId: firstStationId,
			},
			station: { name: "Station 5", locationNote: null },
		});

		expect(notifications.map(({ notification }) => notification.type)).toEqual([
			"TO_MATCH_STATION_MOVED",
			"TO_MATCH_STATION_MOVED",
		]);
		expect(notifications[0].notification).toMatchObject({
			meta: { station: "Station 5" },
		});
	});
});
