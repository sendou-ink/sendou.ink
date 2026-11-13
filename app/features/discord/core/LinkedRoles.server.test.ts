import { sub } from "date-fns";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as DiscordTokenFactory from "~/db/seed/factories/DiscordTokenFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as Bans from "~/features/ban/core/Bans.server";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import * as DiscordTokenRepository from "../DiscordTokenRepository.server";
import * as LinkedRoles from "./LinkedRoles.server";

let roleConnectionResponses: Array<() => Response> = [];
let tokenResponse: () => Response;
const pushes: Array<{ authorization: string | null; body: unknown }> = [];

const fetchMock = vi.fn(
	async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);

		if (request.url.endsWith("/oauth2/token")) return tokenResponse();

		if (request.url.endsWith("/role-connection")) {
			pushes.push({
				authorization: request.headers.get("Authorization"),
				body: JSON.parse(String(init?.body)),
			});
			return roleConnectionResponses.shift()?.() ?? new Response("{}");
		}

		throw new Error(`Unexpected fetch: ${request.url}`);
	},
);

const users = UserFactory.pool();
const linkedUserId = () => users.id(1);
const failingUserId = () => users.id(1);
const succeedingUserId = () => users.id(2);

const expired = () => dateToDatabaseTimestamp(sub(new Date(), { hours: 1 }));

beforeEach(async () => {
	await users.create(2);
	vi.stubGlobal("fetch", fetchMock);
	fetchMock.mockClear();
	roleConnectionResponses = [];
	tokenResponse = () => new Response(null, { status: 500 });
	pushes.length = 0;
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("LinkedRoles.syncUser", () => {
	test("pushes the user's Plus tier", async () => {
		await UserFactory.grant(linkedUserId(), { plusTier: 2 });
		await DiscordTokenFactory.create({
			userId: linkedUserId(),
			accessToken: "access",
		});

		await LinkedRoles.syncUser(linkedUserId());

		expect(pushes).toEqual([
			{
				authorization: "Bearer access",
				body: expect.objectContaining({ metadata: { plustier: 2 } }),
			},
		]);
	});

	test("pushes no tier for a banned Plus member", async () => {
		await UserFactory.grant(linkedUserId(), {
			plusTier: 1,
			ban: { banned: 1, bannedReason: null, bannedByUserId: null },
		});
		await Bans.refresh();
		await DiscordTokenFactory.create({ userId: linkedUserId() });

		await LinkedRoles.syncUser(linkedUserId());

		expect(pushes).toEqual([
			{
				authorization: expect.any(String),
				body: expect.objectContaining({ metadata: {} }),
			},
		]);
	});

	test("makes no request for a user who has not linked", async () => {
		await UserFactory.grant(linkedUserId(), { plusTier: 1 });

		await LinkedRoles.syncUser(linkedUserId());

		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("deletes the tokens Discord no longer accepts", async () => {
		await DiscordTokenFactory.create({ userId: linkedUserId() });
		roleConnectionResponses = [() => new Response(null, { status: 401 })];

		await LinkedRoles.syncUser(linkedUserId());

		expect(
			await DiscordTokenRepository.findByUserId(linkedUserId()),
		).toBeUndefined();
	});

	test("refreshes an expired access token and stores the new tokens", async () => {
		await DiscordTokenFactory.create({
			userId: linkedUserId(),
			expiresAt: expired(),
		});
		tokenResponse = () =>
			Response.json({
				access_token: "new-access",
				refresh_token: "new-refresh",
				token_type: "Bearer",
				expires_in: 604800,
				scope: "identify role_connections.write",
			});

		await LinkedRoles.syncUser(linkedUserId());

		expect(pushes[0]?.authorization).toBe("Bearer new-access");
		expect(
			await DiscordTokenRepository.findByUserId(linkedUserId()),
		).toMatchObject({
			accessToken: "new-access",
			refreshToken: "new-refresh",
		});
	});

	test("deletes the tokens when the refresh token is rejected", async () => {
		await DiscordTokenFactory.create({
			userId: linkedUserId(),
			expiresAt: expired(),
		});
		tokenResponse = () =>
			Response.json({ error: "invalid_grant" }, { status: 400 });

		await LinkedRoles.syncUser(linkedUserId());

		expect(pushes).toEqual([]);
		expect(
			await DiscordTokenRepository.findByUserId(linkedUserId()),
		).toBeUndefined();
	});

	test("keeps the tokens when Discord fails for another reason", async () => {
		await DiscordTokenFactory.create({ userId: linkedUserId() });
		roleConnectionResponses = [() => new Response(null, { status: 500 })];

		await expect(LinkedRoles.syncUser(linkedUserId())).rejects.toThrow();

		expect(
			await DiscordTokenRepository.findByUserId(linkedUserId()),
		).toBeDefined();
	});
});

describe("LinkedRoles.syncUsers", () => {
	test("carries on after a user fails", async () => {
		await DiscordTokenFactory.create({ userId: failingUserId() });
		await DiscordTokenFactory.create({ userId: succeedingUserId() });
		roleConnectionResponses = [
			() => new Response(null, { status: 500 }),
			() => new Response("{}"),
		];

		await LinkedRoles.syncUsers([failingUserId(), succeedingUserId()]);

		expect(pushes).toHaveLength(2);
	});
});
