import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ServerConfig } from "~/config.server";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import { testTournament } from "~/features/tournament-bracket/core/tests/test-utils";
import {
	findProgram,
	isBroadcastEnabled,
	isBroadcastProducer,
	pointProgram,
	regenerateProgramKey,
	requireBroadcastProducer,
} from "./broadcast-utils.server";

const ORGANIZER_ID = 1;
const STREAMER_ID = 2;
const RANDOM_USER_ID = 3;
const ORGANIZATION_ID = 10;

const users = UserFactory.pool();

const channel = {
	platform: "TWITCH" as const,
	account: "sendouink",
	slug: "sendouink",
};
const OTHER_CHANNEL = {
	platform: "TWITCH" as const,
	account: "sendouink2",
	slug: "sendouink2",
};
const rules = CAST_PRODUCER_RULES;

const originalBroadcastOrgIds = ServerConfig.broadcastOrgIds;

afterEach(() => {
	ServerConfig.broadcastOrgIds = originalBroadcastOrgIds;
});

describe("isBroadcastEnabled", () => {
	test.each([
		{
			why: "every org enabled",
			orgIds: "*",
			organizationId: null,
			expected: true,
		},
		{
			why: "org on the list",
			orgIds: [ORGANIZATION_ID],
			organizationId: ORGANIZATION_ID,
			expected: true,
		},
		{
			why: "org not on the list",
			orgIds: [ORGANIZATION_ID + 1],
			organizationId: ORGANIZATION_ID,
			expected: false,
		},
		{
			why: "no org with a list",
			orgIds: [ORGANIZATION_ID],
			organizationId: null,
			expected: false,
		},
	] as const)("$why", ({ orgIds, organizationId, expected }) => {
		ServerConfig.broadcastOrgIds = orgIds === "*" ? "*" : [...orgIds];

		expect(isBroadcastEnabled(tournament(organizationId))).toBe(expected);
	});
});

describe("isBroadcastProducer", () => {
	test.each([
		{ why: "organizer", userId: ORGANIZER_ID, orgIds: "*", expected: true },
		{ why: "streamer", userId: STREAMER_ID, orgIds: "*", expected: true },
		{
			why: "random user",
			userId: RANDOM_USER_ID,
			orgIds: "*",
			expected: false,
		},
		{ why: "logged out", userId: null, orgIds: "*", expected: false },
		{
			why: "organizer of an org not enabled",
			userId: ORGANIZER_ID,
			orgIds: [ORGANIZATION_ID + 1],
			expected: false,
		},
		{
			why: "organizer of an enabled org",
			userId: ORGANIZER_ID,
			orgIds: [ORGANIZATION_ID],
			expected: true,
		},
	] as const)("$why", ({ userId, orgIds, expected }) => {
		ServerConfig.broadcastOrgIds = orgIds === "*" ? "*" : [...orgIds];
		const user = userId === null ? undefined : { id: userId };

		expect(isBroadcastProducer(tournament(ORGANIZATION_ID), user)).toBe(
			expected,
		);
	});
});

describe("requireBroadcastProducer", () => {
	test("passes a producer", () => {
		ServerConfig.broadcastOrgIds = "*";

		expect(() =>
			requireBroadcastProducer(tournament(ORGANIZATION_ID), {
				id: STREAMER_ID,
			}),
		).not.toThrow();
	});

	test("throws a 404 for anyone else", () => {
		ServerConfig.broadcastOrgIds = "*";

		expect(() =>
			requireBroadcastProducer(tournament(ORGANIZATION_ID), {
				id: RANDOM_USER_ID,
			}),
		).toThrow(expect.objectContaining({ status: 404 }));
	});
});

describe("findProgram", () => {
	beforeEach(async () => {
		ServerConfig.broadcastOrgIds = "*";
		await users.create(2);
	});

	test.each([
		{ why: "no key", programKey: null },
		{ why: "an unknown key", programKey: "V1StGXR8_Z5jdHi6B-myT" },
	])("is null for $why", async ({ programKey }) => {
		expect(await findProgram(programKey)).toBeNull();
	});

	test("shows the broadcast the URL was pointed at", async () => {
		const tournamentId = await createTournament();
		const programKey = await point(tournamentId);

		const program = await findProgram(programKey);

		expect(program?.userId).toBe(users.id(1));
		expect(program?.tournament?.ctx.id).toBe(tournamentId);
		expect(program).toMatchObject({
			platform: channel.platform,
			account: channel.account,
		});
	});

	test("gives each channel of the tournament its own URL", async () => {
		const tournamentId = await createTournament();

		const firstKey = await point(tournamentId);
		const otherKey = await point(tournamentId, OTHER_CHANNEL);

		expect(otherKey).not.toBe(firstKey);
		expect((await findProgram(firstKey))?.account).toBe(channel.account);
		expect((await findProgram(otherKey))?.account).toBe(OTHER_CHANNEL.account);
	});

	test("keeps the key when pointed at the next tournament's broadcast", async () => {
		const firstKey = await point(await createTournament());
		const nextTournamentId = await createTournament();

		const nextKey = await point(nextTournamentId);

		expect(nextKey).toBe(firstKey);
		expect((await findProgram(nextKey))?.tournament?.ctx.id).toBe(
			nextTournamentId,
		);
	});

	test("shows no broadcast once the user can't produce it", async () => {
		const tournamentId = await createTournament();
		const programKey = await TournamentBroadcastFactory.pointProgram({
			userId: users.id(2),
			tournamentId,
			channel,
		});

		const program = await findProgram(programKey);

		expect(program?.userId).toBe(users.id(2));
		expect(program?.tournament).toBeNull();
	});

	test("shows no broadcast once broadcasts are turned off for its organization", async () => {
		const programKey = await point(await createTournament());
		ServerConfig.broadcastOrgIds = [ORGANIZATION_ID];

		expect((await findProgram(programKey))?.tournament).toBeNull();
	});
});

describe("regenerateProgramKey", () => {
	beforeEach(async () => {
		ServerConfig.broadcastOrgIds = "*";
		await users.create(1);
	});

	test("replaces the key, the old one no longer found", async () => {
		const tournamentId = await createTournament();
		const oldKey = await point(tournamentId);

		const newKey = await regenerateProgramKey({ userId: users.id(1), channel });

		expect(newKey).not.toBe(oldKey);
		expect(await findProgram(oldKey)).toBeNull();
		expect((await findProgram(newKey))?.tournament?.ctx.id).toBe(tournamentId);
	});

	test("keeps the URL of the user's other channel", async () => {
		const tournamentId = await createTournament();
		await point(tournamentId);
		const otherKey = await point(tournamentId, OTHER_CHANNEL);

		await regenerateProgramKey({ userId: users.id(1), channel });

		expect((await findProgram(otherKey))?.account).toBe(OTHER_CHANNEL.account);
	});

	test("is null before the user generated a URL for the channel", async () => {
		expect(
			await regenerateProgramKey({ userId: users.id(1), channel }),
		).toBeNull();
	});
});

async function createTournament() {
	const { id } = await TournamentFactory.create({ authorId: users.id(1) });

	return id;
}

function point(tournamentId: number, pointedChannel = channel) {
	return pointProgram({
		userId: users.id(1),
		tournamentId,
		channel: pointedChannel,
		rules,
	});
}

function tournament(organizationId: number | null, id = 1) {
	return testTournament({
		ctx: {
			id,
			organization:
				organizationId === null
					? null
					: {
							id: organizationId,
							name: "Org",
							slug: "org",
							isEstablished: 0,
							logoUrl: null,
							members: [],
							series: [],
						},
			permissions: {
				ADMIN: [ORGANIZER_ID],
				ORGANIZE: [ORGANIZER_ID],
				MANAGE_MATCHES: [ORGANIZER_ID, STREAMER_ID],
				REPORT_SCORES: [ORGANIZER_ID, STREAMER_ID],
				EDIT_EVENT_INFO: [ORGANIZER_ID],
				EDIT_IN_GAME_NAMES: [],
			},
		},
	});
}
