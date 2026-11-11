import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import * as TournamentStationRepository from "./TournamentStationRepository.server";

const users = UserFactory.pool();

const station = (name: string, id: number | null = null) => ({
	id,
	name,
	locationNote: null,
	castAccount: null,
});

describe("TournamentStationRepository.setStations", () => {
	beforeEach(async () => {
		await users.create(1);
	});

	test("saves the stations in the given order", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});

		await TournamentStationRepository.setStations({
			tournamentId: tournament.id,
			autoAssign: true,
			stations: [
				{
					id: null,
					name: "Stream",
					locationNote: "On stage",
					castAccount: { platform: "TWITCH", account: "lan_cast" },
				},
				station("Station 1"),
			],
		});

		expect(
			await TournamentStationRepository.findAllByTournamentId(tournament.id),
		).toMatchObject([
			{
				name: "Stream",
				locationNote: "On stage",
				castAccount: { platform: "TWITCH", account: "lan_cast" },
			},
			{ name: "Station 1", locationNote: null, castAccount: null },
		]);
	});

	test("keeps the ids of edited stations and deletes the ones left out", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});
		await TournamentStationRepository.setStations({
			tournamentId: tournament.id,
			autoAssign: true,
			stations: [station("A"), station("B"), station("C")],
		});
		const [a, , c] = await TournamentStationRepository.findAllByTournamentId(
			tournament.id,
		);

		await TournamentStationRepository.setStations({
			tournamentId: tournament.id,
			autoAssign: true,
			stations: [station("C renamed", c.id), station("D"), station("A", a.id)],
		});

		const stations = await TournamentStationRepository.findAllByTournamentId(
			tournament.id,
		);
		expect(stations.map((s) => s.name)).toEqual(["C renamed", "D", "A"]);
		expect(stations[0].id).toBe(c.id);
		expect(stations[2].id).toBe(a.id);
	});

	test("leaves another tournament's stations alone", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});
		const otherTournament = await TournamentFactory.create({
			authorId: users.id(1),
		});
		await TournamentStationRepository.setStations({
			tournamentId: otherTournament.id,
			autoAssign: true,
			stations: [station("Other")],
		});
		const [otherStation] =
			await TournamentStationRepository.findAllByTournamentId(
				otherTournament.id,
			);

		await TournamentStationRepository.setStations({
			tournamentId: tournament.id,
			autoAssign: true,
			stations: [station("Hijacked", otherStation.id)],
		});

		expect(
			await TournamentStationRepository.findAllByTournamentId(
				otherTournament.id,
			),
		).toMatchObject([{ id: otherStation.id, name: "Other" }]);
	});

	test("saves whether stations are auto-assigned, keeping the other settings", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});
		const before = await TournamentRepository.findById(tournament.id);

		await TournamentStationRepository.setStations({
			tournamentId: tournament.id,
			autoAssign: false,
			stations: [],
		});

		const after = await TournamentRepository.findById(tournament.id);
		expect(after?.settings).toEqual({
			...before?.settings,
			autoAssignStations: false,
		});
	});
});
