import { addDays } from "date-fns";
import { beforeEach, describe, expect, test } from "vitest";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import {
	findCastProgram,
	findScannerBroadcast,
} from "./broadcast-cast-utils.server";

const CAST_ACCOUNT = {
	platform: "TWITCH" as const,
	account: "SendouInk",
	name: "Sendou.ink",
};

const users = UserFactory.pool();

beforeEach(async () => {
	await users.create(1);
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

describe("findScannerBroadcast", () => {
	test("follows the broadcast the user's OBS URL shows", async () => {
		const tournament = await createTournament();
		await TournamentBroadcastFactory.pointProgram({
			userId: users.id(1),
			tournamentId: tournament.id,
			channel: CAST_ACCOUNT,
		});

		expect(await findScannerBroadcast(users.id(1))).toEqual({
			tournamentId: tournament.id,
			slug: "sendouink",
		});
	});

	test("is null without an OBS URL", async () => {
		expect(await findScannerBroadcast(users.id(1))).toBeNull();
	});

	test("is null while the tournament is days away", async () => {
		const tournament = await createTournament(addDays(new Date(), 5));
		await TournamentBroadcastFactory.pointProgram({
			userId: users.id(1),
			tournamentId: tournament.id,
			channel: CAST_ACCOUNT,
		});

		expect(await findScannerBroadcast(users.id(1))).toBeNull();
	});
});

function createTournament(startsAt = new Date()) {
	return TournamentFactory.create(
		{
			authorId: users.id(1),
			startTimes: [dateToDatabaseTimestamp(startsAt)],
		},
		{ castAccounts: [CAST_ACCOUNT] },
	);
}
