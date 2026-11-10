import { afterEach, describe, expect, test } from "vitest";
import { ServerConfig } from "~/config.server";
import { testTournament } from "~/features/tournament-bracket/core/tests/test-utils";
import {
	isBroadcastEnabled,
	isBroadcastProducer,
	requireBroadcastProducer,
} from "./broadcast-utils.server";

const ORGANIZER_ID = 1;
const STREAMER_ID = 2;
const RANDOM_USER_ID = 3;
const ORGANIZATION_ID = 10;

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

function tournament(organizationId: number | null) {
	return testTournament({
		ctx: {
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
