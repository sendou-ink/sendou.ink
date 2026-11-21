import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedLoader } from "~/utils/Test";
import {
	createFinalizedLanTournament,
	createStartedLanTournament,
} from "../tests/fixtures";
import {
	loader,
	type TournamentStationsDisplayLoaderData,
} from "./to.$id.stations.display.server";

const displayLoader = wrappedLoader<TournamentStationsDisplayLoaderData>({
	loader,
});

const users = UserFactory.pool();

describe("station display screen loader", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("shows the stations to a logged out viewer", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds: [first],
		} = await createStartedLanTournament({
			authorId: users.id(1),
			teamRosters: R.chunk(users.ids().slice(1), 4),
			autoAssign: false,
		});
		await TournamentMatchStationFactory.create({ matchId: first, stationId });

		const data = await displayLoader({
			params: { id: String(tournamentId) },
		});

		expect(data.stations).toMatchObject([
			{ name: "Station 1", now: { id: first } },
			{ name: "Station 2", now: null },
		]);
		expect(data.waiting).toHaveLength(1);
		expect(data.topicsKey).toContain(`tournament__${tournamentId}`);
	});

	test("shows a finalized tournament's stations empty and opens no stream", async () => {
		const { tournamentId } = await createFinalizedLanTournament({
			authorId: users.id(1),
			teamRosters: R.chunk(users.ids().slice(1), 4),
		});

		const data = await displayLoader({
			params: { id: String(tournamentId) },
		});

		expect(data).toMatchObject({
			isFinalized: true,
			stations: [],
			waiting: [],
			topicsKey: null,
		});
	});

	test("404s for an online tournament", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});

		await expect(
			displayLoader({ params: { id: String(tournament.id) } }),
		).rejects.toThrow("404");
	});
});
