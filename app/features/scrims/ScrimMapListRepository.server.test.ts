import { beforeEach, describe, expect, test } from "vitest";
import * as ScrimPostFactory from "~/db/seed/factories/ScrimPostFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { TeamPickSettings } from "~/db/tables-json";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import * as TeamPick from "~/features/tournament/core/TeamPick";
import * as ScrimMapListRepository from "./ScrimMapListRepository.server";
import * as ScrimMapRepository from "./ScrimMapRepository.server";

const users = UserFactory.pool();

const szTcTeamPick = (pool: TeamPickSettings["pool"]): TeamPickSettings => ({
	modes: [
		{ mode: "SZ", count: 4 },
		{ mode: "TC", count: 4 },
	],
	pool,
});

async function createScrimWithTeamPickTournament(teamPick: TeamPickSettings) {
	const tournament = await TournamentFactory.create({
		authorId: users.id(1),
		mapPickingStyle: "AUTO",
		teamPick,
	});
	const scrimPost = await ScrimPostFactory.create(
		{ users: [{ userId: users.id(1), isOwner: 1 }] },
		{
			requests: [
				{ users: [{ userId: users.id(2), isOwner: 1 }], isAccepted: true },
			],
		},
	);

	return { tournamentId: tournament.id, scrimPostId: scrimPost.id };
}

describe("ScrimMapListRepository.findMapListsByScrimPostId", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test.each(["SENDOUQ", "ALL"] as const)(
		"resolves a %s team pick tournament to its effective pool",
		async (pool) => {
			const teamPick = szTcTeamPick(pool);
			const { tournamentId, scrimPostId } =
				await createScrimWithTeamPickTournament(teamPick);

			await ScrimMapListRepository.submitMapListAndGenerateIfNeeded({
				scrimPostId,
				side: "ALPHA",
				source: "TOURNAMENT",
				tournamentId,
			});

			const [mapList] =
				await ScrimMapListRepository.findMapListsByScrimPostId(scrimPostId);

			expect(new MapPool(mapList!.mapList).serialized).toBe(
				TeamPick.effectivePool(teamPick, []).serialized,
			);
		},
	);
});

describe("ScrimMapListRepository.submitMapListAndGenerateIfNeeded", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("generates the first map when both sides pick a SendouQ team pick tournament", async () => {
		const { tournamentId, scrimPostId } =
			await createScrimWithTeamPickTournament(szTcTeamPick("SENDOUQ"));

		for (const side of ["ALPHA", "BRAVO"] as const) {
			await ScrimMapListRepository.submitMapListAndGenerateIfNeeded({
				scrimPostId,
				side,
				source: "TOURNAMENT",
				tournamentId,
			});
		}

		const maps = await ScrimMapRepository.findMapsByScrimPostId(scrimPostId);

		expect(maps).toHaveLength(1);
	});
});
