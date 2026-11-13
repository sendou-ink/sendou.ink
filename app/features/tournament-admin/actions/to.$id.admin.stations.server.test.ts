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

const createTournament = async ({ isLan }: { isLan: boolean }) => {
	const tournament = await TournamentFactory.create({
		authorId: organizerId(),
	});
	if (isLan) {
		await CalendarEventVenueFactory.create({ eventId: tournament.eventId });
	}

	return tournament;
};

const station = (
	name: string,
	{
		stationId,
		locationNote = null,
	}: { stationId?: number; locationNote?: string | null } = {},
) => ({ stationId, name, locationNote });

describe("stations action", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("saves the stations in the given order", async () => {
		const tournament = await createTournament({ isLan: true });

		await stationsAction(
			{
				autoAssign: true,
				stations: [
					station("Main stage", { locationNote: "On stage" }),
					station("Station 1"),
				],
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			await TournamentStationRepository.findAllByTournamentId(tournament.id),
		).toMatchObject([
			{ name: "Main stage", locationNote: "On stage" },
			{ name: "Station 1", locationNote: null },
		]);
	});

	test("rejects names that repeat", async () => {
		const tournament = await createTournament({ isLan: true });

		const res = await stationsAction(
			{
				autoAssign: true,
				stations: [station("Station 1"), station("station 1")],
			},
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(res.fieldErrors["stations[1].name"]).toBe(
			"forms:errors.stationNameNotUnique",
		);
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

	test("saving no stations clears them", async () => {
		const tournament = await createTournament({ isLan: true });
		await TournamentStationFactory.create({
			tournamentId: tournament.id,
			name: "Station 1",
		});
		await TournamentStationFactory.create({
			tournamentId: tournament.id,
			name: "Station 2",
		});

		await stationsAction(
			{ autoAssign: true, stations: [] },
			{ user: organizerId(), params: { id: String(tournament.id) } },
		);

		expect(
			await TournamentStationRepository.findAllByTournamentId(tournament.id),
		).toEqual([]);
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
