import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ServerConfig } from "~/config.server";
import * as TournamentBroadcastFactory from "~/db/seed/factories/TournamentBroadcastFactory";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { CAST_PRODUCER_RULES } from "~/features/broadcast-cast/broadcast-cast-constants";
import { testTournament } from "~/features/tournament-bracket/core/tests/test-utils";
import type { BroadcastStreamMessage } from "./broadcast-types";
import {
	findProgram,
	isBroadcastEnabled,
	isBroadcastProducer,
	pointProgram,
	regenerateProgramKey,
	requireBroadcastProducer,
	updateObsAudio,
} from "./broadcast-utils.server";
import * as BroadcastHub from "./core/BroadcastHub.server";

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
		expect(program?.shows?.tournament.ctx.id).toBe(tournamentId);
		expect(program?.shows?.channel).toEqual({
			platform: channel.platform,
			account: channel.account,
		});
	});

	test("moves the user's one URL to the other channel it is pointed at", async () => {
		const tournamentId = await createTournament();

		const firstKey = await point(tournamentId);
		const otherKey = await point(tournamentId, OTHER_CHANNEL);

		expect(otherKey).toBe(firstKey);
		expect((await findProgram(otherKey))?.shows?.channel.account).toBe(
			OTHER_CHANNEL.account,
		);
	});

	test("keeps the key when pointed at the next tournament's broadcast", async () => {
		const firstKey = await point(await createTournament());
		const nextTournamentId = await createTournament();

		const nextKey = await point(nextTournamentId);

		expect(nextKey).toBe(firstKey);
		expect((await findProgram(nextKey))?.shows?.tournament.ctx.id).toBe(
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
		expect(program?.shows).toBeNull();
	});

	test("shows no broadcast once broadcasts are turned off for its organization", async () => {
		const programKey = await point(await createTournament());
		ServerConfig.broadcastOrgIds = [ORGANIZATION_ID];

		expect((await findProgram(programKey))?.shows).toBeNull();
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

		const newKey = await regenerateProgramKey(users.id(1));

		expect(newKey).not.toBe(oldKey);
		expect(await findProgram(oldKey)).toBeNull();
		expect((await findProgram(newKey))?.shows?.tournament.ctx.id).toBe(
			tournamentId,
		);
	});

	test("is null before the user generated a URL", async () => {
		expect(await regenerateProgramKey(users.id(1))).toBeNull();
	});
});

describe("updateObsAudio", () => {
	beforeEach(async () => {
		ServerConfig.broadcastOrgIds = "*";
		await users.create(1);
	});

	test("saves it with the user's URL, the same in every tournament", async () => {
		const programKey = await point(await createTournament());
		const obsAudio = { inputName: "Capture", port: 4455, password: "pw" };

		await updateObsAudio({ userId: users.id(1), obsAudio });
		await point(await createTournament(), OTHER_CHANNEL);

		expect((await findProgram(programKey))?.obsAudio).toEqual(obsAudio);
	});

	test("tells the overlays showing the user's URL right away, null once turned off", async () => {
		const tournamentId = await createTournament();
		const program = await findProgram(await point(tournamentId));
		const overlay = connectOverlay({ tournamentId, programId: program!.id });
		const obsAudio = { inputName: "Capture", port: 4455, password: null };

		await updateObsAudio({ userId: users.id(1), obsAudio });
		await updateObsAudio({ userId: users.id(1), obsAudio: null });

		expect(overlay.obsAudios()).toEqual([obsAudio, null]);
		overlay.disconnect();
	});

	test("is false before the user generated a URL", async () => {
		expect(await updateObsAudio({ userId: users.id(1), obsAudio: null })).toBe(
			false,
		);
	});
});

/** An OBS source connected to the broadcast through the user's OBS URL. */
function connectOverlay({
	tournamentId,
	programId,
}: {
	tournamentId: number;
	programId: number;
}) {
	const connection = new AbortController();
	const messages: BroadcastStreamMessage[] = [];
	BroadcastHub.connect({
		tournamentId,
		slug: channel.slug,
		layout: { producer: rules, build: async () => null },
		role: "source",
		send: (message) => messages.push(JSON.parse(message)),
		close: () => {},
		signal: connection.signal,
		isClipSender: false,
		programId,
	});

	return {
		obsAudios: () =>
			messages.flatMap((message) =>
				message.kind === "obsAudio" ? [message.obsAudio] : [],
			),
		disconnect: () => connection.abort(),
	};
}

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
				EDIT_EVENT_INFO: [ORGANIZER_ID],
				EDIT_IN_GAME_NAMES: [],
			},
		},
	});
}
