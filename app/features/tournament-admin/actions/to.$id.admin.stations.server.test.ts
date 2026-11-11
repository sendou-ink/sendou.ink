import { beforeEach, describe, expect, test } from "vitest";
import * as CalendarEventVenueFactory from "~/db/seed/factories/CalendarEventVenueFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentStationFactory from "~/db/seed/factories/TournamentStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentStationRepository from "~/features/tournament-stations/TournamentStationRepository.server";
import type { stationsFormSchema } from "~/features/tournament-stations/tournament-stations-schemas";
import { assertResponseErrored, wrappedAction } from "~/utils/Test";
import { action } from "./to.$id.admin.stations.server";

const stationsAction = wrappedAction<typeof stationsFormSchema>({
	action,
	isJsonSubmission: true,
});

const users = UserFactory.pool();
const organizerId = () => users.id(1);

const CAST_ACCOUNT = {
	platform: "TWITCH" as const,
	account: "lan_cast",
	name: "LAN Cast",
};

const createTournament = async ({ isLan }: { isLan: boolean }) => {
	const tournament = await TournamentFactory.create(
		{ authorId: organizerId() },
		{ castAccounts: [CAST_ACCOUNT] },
	);
	if (isLan) {
		await CalendarEventVenueFactory.create({ eventId: tournament.eventId });
	}

	return tournament;
};

const station = (
	name: string,
	{
		stationId,
		castAccount = null,
	}: { stationId?: number; castAccount?: string | null } = {},
) => ({ stationId, name, locationNote: null, castAccount });

describe("stations action", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("saves the stations linking the chosen cast account", async () => {
		const tournament = await createTournament({ isLan: true });

		await stationsAction(
			{
				autoAssign: true,
				stations: [
					station("Stream", { castAccount: "TWITCH:lan_cast" }),
					station("Station 1"),
				],
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			await TournamentStationRepository.findAllByTournamentId(tournament.id),
		).toMatchObject([
			{
				name: "Stream",
				castAccount: { platform: "TWITCH", account: "lan_cast" },
			},
			{ name: "Station 1", castAccount: null },
		]);
	});

	test.each([
		{
			why: "names repeat",
			stations: [station("Station 1"), station("station 1")],
			field: "stations[1].name",
			error: "forms:errors.stationNameNotUnique",
		},
		{
			why: "two stations share a cast account",
			stations: [
				station("Stream", { castAccount: "TWITCH:lan_cast" }),
				station("Stream 2", { castAccount: "TWITCH:lan_cast" }),
			],
			field: "stations[1].castAccount",
			error: "forms:errors.stationCastAccountNotUnique",
		},
		{
			why: "the cast account isn't the tournament's",
			stations: [station("Stream", { castAccount: "TWITCH:someone_else" })],
			field: "stations[0].castAccount",
			error: "forms:errors.stationCastAccountUnknown",
		},
	])("rejects the save when $why", async ({ stations, field, error }) => {
		const tournament = await createTournament({ isLan: true });

		const res = await stationsAction(
			{ autoAssign: true, stations },
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(res.fieldErrors[field]).toBe(error);
		expect(
			await TournamentStationRepository.findAllByTournamentId(tournament.id),
		).toEqual([]);
	});

	test("rejects editing another tournament's station", async () => {
		const tournament = await createTournament({ isLan: true });
		const otherTournament = await createTournament({ isLan: true });
		const otherStation = await TournamentStationFactory.create({
			tournamentId: otherTournament.id,
			name: "Other",
		});

		const res = await stationsAction(
			{
				autoAssign: true,
				stations: [station("Hijacked", { stationId: otherStation.id })],
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(res.fieldErrors["stations[0].name"]).toBe("Unknown station");
	});

	test("rejects an online tournament", async () => {
		const tournament = await createTournament({ isLan: false });

		const res = await stationsAction(
			{ autoAssign: true, stations: [station("Station 1")] },
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		assertResponseErrored(res, "Stations can't be edited");
	});
});
