import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ServerConfig } from "~/config.server";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { findCastProgram } from "./broadcast-cast-utils.server";

const CAST_ACCOUNT = {
	platform: "TWITCH" as const,
	account: "SendouInk",
	name: "Sendou.ink",
};

const users = UserFactory.pool();

const originalBroadcastOrgIds = ServerConfig.broadcastOrgIds;

beforeEach(async () => {
	ServerConfig.broadcastOrgIds = "*";
	await users.create(1);
});

afterEach(() => {
	ServerConfig.broadcastOrgIds = originalBroadcastOrgIds;
});

describe("findCastProgram", () => {
	test("is null for an unknown key", async () => {
		expect(await findCastProgram("V1StGXR8_Z5jdHi6B-myT")).toBeNull();
	});

	test("shows the cast account's broadcast by the channel's URL key", async () => {
		const tournament = await createTournament();
		const programKey = await TournamentBroadcastFactory.pointProgram({
			userId: users.id(1),
			tournamentId: tournament.id,
			channel: CAST_ACCOUNT,
		});

		expect((await findCastProgram(programKey))?.broadcast).toEqual({
			tournamentId: tournament.id,
			slug: "sendouink",
		});
	});

	test("shows no broadcast for a channel that isn't one of the tournament's cast accounts", async () => {
		const tournament = await createTournament();
		const programKey = await TournamentBroadcastFactory.pointProgram({
			userId: users.id(1),
			tournamentId: tournament.id,
			channel: { platform: "TWITCH", account: "someone_else" },
		});

		const program = await findCastProgram(programKey);

		expect(program).not.toBeNull();
		expect(program?.broadcast).toBeNull();
	});
});

function createTournament() {
	return TournamentFactory.create(
		{ authorId: users.id(1) },
		{ castAccounts: [CAST_ACCOUNT] },
	);
}
