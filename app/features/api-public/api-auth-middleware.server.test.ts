import { beforeEach, describe, expect, test } from "vitest";
import * as ApiTokenFactory from "~/db/seed/factories/ApiTokenFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { refreshBannedCache } from "~/features/ban/core/banned.server";
import { apiAuthMiddleware } from "./api-auth-middleware.server";
import { refreshApiTokensCache } from "./api-public-utils.server";

const users = UserFactory.pool();
const allowedUserId = () => users.id(1);
const bannedUserId = () => users.id(2);

const NEXT_RESPONSE_BODY = "next() reached";

const callMiddleware = (
	token: string,
	{ method = "GET" }: { method?: string } = {},
) =>
	apiAuthMiddleware(
		{
			request: new Request("http://app.com/api/tournament/1/teams", {
				method,
				headers: { Authorization: `Bearer ${token}` },
			}),
			context: {},
		},
		async () => new Response(NEXT_RESPONSE_BODY),
	);

const tokenOf = async (userId: number) => {
	const { token } = await ApiTokenFactory.create({ userId, type: "write" });
	await refreshApiTokensCache();

	return token;
};

describe("apiAuthMiddleware", () => {
	beforeEach(async () => {
		await users.create(2, null, { roles: ["API_ACCESSER"] });
		await UserFactory.grant(bannedUserId(), {
			ban: { banned: 1, bannedReason: null, bannedByUserId: null },
		});
		await refreshBannedCache();
	});

	test("lets a token of a user in good standing through", async () => {
		const response = await callMiddleware(await tokenOf(allowedUserId()));

		expect(await response.text()).toBe(NEXT_RESPONSE_BODY);
	});

	test.each(["GET", "POST"])(
		"rejects a banned user's token (%s)",
		async (method) => {
			const response = await callMiddleware(await tokenOf(bannedUserId()), {
				method,
			});

			expect(response.status).toBe(403);
		},
	);
});
