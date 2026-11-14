import * as R from "remeda";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentMatchStationFactory from "~/db/seed/factories/TournamentMatchStationFactory";
import * as TournamentTeamFactory from "~/db/seed/factories/TournamentTeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { createStartedLanTournament } from "~/features/tournament-stations/tests/fixtures";
import { wrappedLoader } from "~/utils/Test";
import {
	loader,
	type TournamentBracketsLoaderData,
} from "./to.$id.brackets.server";

const bracketsLoader = wrappedLoader<TournamentBracketsLoaderData>({ loader });

const users = UserFactory.pool();

describe("brackets loader matchStations", () => {
	beforeEach(async () => {
		await users.create(17);
	});

	test("gives the matches queued on a station their station", async () => {
		const {
			tournamentId,
			stationIds: [stationId],
			semifinalIds,
		} = await createStartedLanTournament({
			authorId: users.id(1),
			teamRosters: R.chunk(users.ids().slice(1), 4),
			stationNames: ["Station 1", "Station 2"],
			autoAssign: false,
		});
		await TournamentMatchStationFactory.create({
			matchId: semifinalIds[0],
			stationId,
		});

		const data = await bracketsLoader({
			params: { id: String(tournamentId) },
		});

		expect(data.matchStations).toEqual({
			[semifinalIds[0]]: {
				id: stationId,
				name: "Station 1",
				shortName: "1",
				locationNote: null,
				isFirstInQueue: true,
			},
		});
	});

	test("is empty for an online tournament", async () => {
		const tournament = await TournamentFactory.create({
			authorId: users.id(1),
		});
		for (const memberUserIds of R.chunk(users.ids().slice(1), 4)) {
			await TournamentTeamFactory.create(
				{ tournamentId: tournament.id, memberUserIds },
				{ isCheckedIn: true },
			);
		}
		await TournamentFactory.startBracket(tournament.id);

		const data = await bracketsLoader({
			params: { id: String(tournament.id) },
		});

		expect(data.matchStations).toEqual({});
	});
});
