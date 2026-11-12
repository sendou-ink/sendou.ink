import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ServerConfig } from "~/config.server";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import { testTournament } from "~/features/tournament-bracket/core/tests/test-utils";
import * as BroadcastRepository from "./BroadcastRepository.server";
import {
	canWatchProgram,
	isBroadcastEnabled,
	isBroadcastProducer,
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

describe("canWatchProgram", () => {
	beforeEach(async () => {
		ServerConfig.broadcastOrgIds = "*";
		await users.create(1);
	});

	test("admits a producer without a key", async () => {
		const tournamentId = await createTournament();

		expect(
			await canWatchProgram({
				tournament: tournament(ORGANIZATION_ID, tournamentId),
				user: { id: STREAMER_ID },
				channel,
				programKey: null,
			}),
		).toBe(true);
	});

	test("admits anyone with the program key", async () => {
		const tournamentId = await createTournament();
		const programKey = await generateKey(tournamentId);

		expect(await watchesSignedOut(tournamentId, programKey)).toBe(true);
	});

	test.each([
		{ why: "missing key", wrongKey: () => null },
		{ why: "shorter key", wrongKey: (key: string) => key.slice(0, -1) },
		{
			why: "key of the same length",
			wrongKey: (key: string) =>
				`${key.slice(0, -1)}${key.endsWith("a") ? "b" : "a"}`,
		},
	])("rejects a $why", async ({ wrongKey }) => {
		const tournamentId = await createTournament();
		const programKey = await generateKey(tournamentId);

		expect(await watchesSignedOut(tournamentId, wrongKey(programKey))).toBe(
			false,
		);
	});

	test("rejects any key while none was generated", async () => {
		const tournamentId = await createTournament();
		await TournamentBroadcastFactory.create({ tournamentId, channel });

		expect(await watchesSignedOut(tournamentId, "")).toBe(false);
		expect(await watchesSignedOut(tournamentId, "some-key")).toBe(false);
	});

	test("rejects the key of an organization broadcasts were turned off for", async () => {
		const tournamentId = await createTournament();
		const programKey = await generateKey(tournamentId);
		ServerConfig.broadcastOrgIds = [ORGANIZATION_ID + 1];

		expect(await watchesSignedOut(tournamentId, programKey)).toBe(false);
	});
});

describe("regenerateProgramKey", () => {
	beforeEach(async () => {
		ServerConfig.broadcastOrgIds = "*";
		await users.create(1);
	});

	test("replaces the key, the old one no longer admitting", async () => {
		const tournamentId = await createTournament();
		const oldKey = await generateKey(tournamentId);

		const newKey = await generateKey(tournamentId);

		expect(newKey).not.toBe(oldKey);
		expect(await watchesSignedOut(tournamentId, oldKey)).toBe(false);
		expect(await watchesSignedOut(tournamentId, newKey)).toBe(true);
	});
});

async function createTournament() {
	const { id } = await TournamentFactory.create({ authorId: users.id(1) });

	return id;
}

async function generateKey(tournamentId: number) {
	await regenerateProgramKey({ tournamentId, channel, rules });

	const broadcast = await BroadcastRepository.findByChannel({
		tournamentId,
		channel,
	});

	return broadcast!.programKey!;
}

function watchesSignedOut(tournamentId: number, programKey: string | null) {
	return canWatchProgram({
		tournament: tournament(ORGANIZATION_ID, tournamentId),
		user: undefined,
		channel,
		programKey,
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
				EDIT_EVENT_INFO: [ORGANIZER_ID],
				EDIT_IN_GAME_NAMES: [],
			},
		},
	});
}
