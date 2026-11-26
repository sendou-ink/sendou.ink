import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ServerConfig } from "~/config.server";
import * as DiscordOAuth from "./DiscordOAuth.server";

const PKCE_FLOW: DiscordOAuth.Flow = {
	scopes: ["identify", "email"],
	callbackPath: "/auth/callback",
	pkce: true,
	stateCookie: { name: "oauth2", path: "/" },
};
const PLAIN_FLOW: DiscordOAuth.Flow = {
	scopes: ["identify", "role_connections.write"],
	callbackPath: "/discord/oauth-callback",
	pkce: false,
	stateCookie: { name: "discord_linked_role", path: "/discord" },
};

let tokenResponse: () => Response;
const tokenRequests: Array<{
	authorization: string | null;
	body: Record<string, string>;
}> = [];

const fetchMock = vi.fn(
	async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		if (!request.url.endsWith("/oauth2/token")) {
			throw new Error(`Unexpected fetch: ${request.url}`);
		}

		tokenRequests.push({
			authorization: request.headers.get("Authorization"),
			body: Object.fromEntries(new URLSearchParams(String(init?.body))),
		});

		return tokenResponse();
	},
);

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	tokenRequests.length = 0;
	tokenResponse = () =>
		Response.json({
			access_token: "access",
			refresh_token: "refresh",
			token_type: "Bearer",
			expires_in: 604800,
			scope: "identify email",
		});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("DiscordOAuth.authorizationRedirect", () => {
	test("redirects to Discord with the flow's parameters and a PKCE challenge of the stored verifier", () => {
		const { location, params, setCookie, state, codeVerifier } =
			startFlow(PKCE_FLOW);

		expect(location.origin + location.pathname).toBe(
			"https://discord.com/api/oauth2/authorize",
		);
		expect(params).toEqual({
			response_type: "code",
			client_id: ServerConfig.discord.clientId,
			redirect_uri: expect.stringMatching(/\/auth\/callback$/),
			state,
			scope: "identify email",
			code_challenge_method: "S256",
			code_challenge: createHash("sha256")
				.update(codeVerifier)
				.digest("base64url"),
		});
		expect(setCookie).toMatch(/^oauth2:[\w-]+=/);
		expect(setCookie).toContain("Max-Age=300");
		expect(setCookie).toContain("Path=/;");
		expect(setCookie).toContain("HttpOnly");
		expect(setCookie).toContain("SameSite=Lax");
	});

	test("leaves out PKCE for a flow without it", () => {
		const { params, setCookie } = startFlow(PLAIN_FLOW);

		expect(params).not.toHaveProperty("code_challenge");
		expect(params).not.toHaveProperty("code_challenge_method");
		expect(setCookie).toMatch(/^discord_linked_role:[\w-]+=/);
		expect(setCookie).toContain("Path=/discord;");
	});

	test("passes the prompt", () => {
		const { params } = startFlow(PKCE_FLOW, { prompt: "none" });

		expect(params.prompt).toBe("none");
	});

	test("gives every flow a state of its own", () => {
		expect(startFlow(PKCE_FLOW).state).not.toBe(startFlow(PKCE_FLOW).state);
	});
});

describe("DiscordOAuth.exchangeCode", () => {
	test("exchanges the code with the stored code verifier", async () => {
		const flow = startFlow(PKCE_FLOW);

		const tokens = await DiscordOAuth.exchangeCode(
			callbackRequest({ state: flow.state, cookies: [flow.cookie] }),
			PKCE_FLOW,
		);

		expect(tokens).toEqual({
			accessToken: "access",
			refreshToken: "refresh",
			expiresAt: expect.any(Date),
		});
		expect(tokenRequests[0].body).toEqual({
			grant_type: "authorization_code",
			code: "the-code",
			redirect_uri: flow.params.redirect_uri,
			code_verifier: flow.codeVerifier,
		});
		expect(tokenRequests[0].authorization).toBe(
			`Basic ${Buffer.from(`${ServerConfig.discord.clientId}:${ServerConfig.discord.clientSecret}`).toString("base64")}`,
		);
	});

	test("sends no code verifier for a flow without PKCE", async () => {
		const flow = startFlow(PLAIN_FLOW);

		await DiscordOAuth.exchangeCode(
			callbackRequest({ state: flow.state, cookies: [flow.cookie] }),
			PLAIN_FLOW,
		);

		expect(tokenRequests[0].body).not.toHaveProperty("code_verifier");
	});

	test("accepts a state cookie written by remix-auth-oauth2 before the switch", async () => {
		await DiscordOAuth.exchangeCode(
			callbackRequest({
				state: "abc",
				cookies: [
					"oauth2:3f1c2a9e-8d4b-4c6f-9a1e-2b7d5c0e4f81=state=abc&abc=verifier123",
				],
			}),
			PKCE_FLOW,
		);

		expect(tokenRequests[0].body.code_verifier).toBe("verifier123");
	});

	test("finds the state among several flows in flight", async () => {
		const first = startFlow(PKCE_FLOW);
		const second = startFlow(PKCE_FLOW);

		await DiscordOAuth.exchangeCode(
			callbackRequest({
				state: first.state,
				cookies: ["other=1", first.cookie, second.cookie],
			}),
			PKCE_FLOW,
		);

		expect(tokenRequests[0].body.code_verifier).toBe(first.codeVerifier);
	});

	test("throws MissingStateError without the state cookie", async () => {
		const flow = startFlow(PKCE_FLOW);
		const otherFlow = startFlow(PLAIN_FLOW);

		await expect(
			DiscordOAuth.exchangeCode(
				callbackRequest({ state: flow.state, cookies: [otherFlow.cookie] }),
				PKCE_FLOW,
			),
		).rejects.toBeInstanceOf(DiscordOAuth.MissingStateError);
		expect(tokenRequests).toEqual([]);
	});

	test("throws when the state doesn't match the cookie", async () => {
		const flow = startFlow(PKCE_FLOW);

		await expect(
			DiscordOAuth.exchangeCode(
				callbackRequest({ state: "forged", cookies: [flow.cookie] }),
				PKCE_FLOW,
			),
		).rejects.toThrow("doesn't match");
		expect(tokenRequests).toEqual([]);
	});

	test("throws OAuthError with the code Discord redirected back with", async () => {
		const flow = startFlow(PKCE_FLOW);

		const error = await DiscordOAuth.exchangeCode(
			new Request(
				`http://localhost/auth/callback?error=access_denied&state=${flow.state}`,
				{ headers: { Cookie: flow.cookie } },
			),
			PKCE_FLOW,
		).catch((e) => e);

		expect(error).toBeInstanceOf(DiscordOAuth.OAuthError);
		expect(error.code).toBe("access_denied");
	});

	test("throws OAuthError for a cancelled flow whose state cookie is gone", async () => {
		const error = await DiscordOAuth.exchangeCode(
			new Request(
				"http://localhost/auth/callback?error=access_denied&state=expired",
			),
			PKCE_FLOW,
		).catch((e) => e);

		expect(error).toBeInstanceOf(DiscordOAuth.OAuthError);
		expect(error.code).toBe("access_denied");
	});

	test("throws TokenRequestError with the status of an unexpected token response", async () => {
		const flow = startFlow(PKCE_FLOW);
		tokenResponse = () =>
			Response.json(
				{ message: "rate limited", retry_after: 5 },
				{ status: 429 },
			);

		const error = await DiscordOAuth.exchangeCode(
			callbackRequest({ state: flow.state, cookies: [flow.cookie] }),
			PKCE_FLOW,
		).catch((e) => e);

		expect(error).toBeInstanceOf(DiscordOAuth.TokenRequestError);
		expect(error.status).toBe(429);
	});
});

describe("DiscordOAuth.refreshTokens", () => {
	test("requests new tokens with the refresh token", async () => {
		const tokens = await DiscordOAuth.refreshTokens(PLAIN_FLOW, "old-refresh");

		expect(tokens.accessToken).toBe("access");
		expect(tokenRequests[0].body).toEqual({
			grant_type: "refresh_token",
			refresh_token: "old-refresh",
			scope: "identify role_connections.write",
		});
	});

	test("throws OAuthError with the code of Discord's error response", async () => {
		tokenResponse = () =>
			Response.json({ error: "invalid_grant" }, { status: 400 });

		const error = await DiscordOAuth.refreshTokens(PLAIN_FLOW, "revoked").catch(
			(e) => e,
		);

		expect(error).toBeInstanceOf(DiscordOAuth.OAuthError);
		expect(error.code).toBe("invalid_grant");
	});
});

function startFlow(flow: DiscordOAuth.Flow, options?: { prompt?: "none" }) {
	const response = DiscordOAuth.authorizationRedirect(flow, options);
	expect(response.status).toBe(302);

	const location = new URL(response.headers.get("Location")!);
	const setCookie = response.headers.get("Set-Cookie")!;
	const cookie = setCookie.split(";")[0];
	const params = Object.fromEntries(location.searchParams);
	const state = params.state;
	const storedValue = new URLSearchParams(
		cookie.slice(cookie.indexOf("=") + 1),
	);

	return {
		location,
		params,
		setCookie,
		cookie,
		state,
		codeVerifier: storedValue.get(state)!,
	};
}

function callbackRequest({
	state,
	cookies,
}: {
	state: string;
	cookies: string[];
}) {
	return new Request(
		`http://localhost/auth/callback?code=the-code&state=${encodeURIComponent(state)}`,
		{ headers: { Cookie: cookies.join("; ") } },
	);
}
