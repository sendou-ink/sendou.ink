/**
 * Discord's OAuth2 authorization code flow, framework free (plain `Request`, `Response` and `fetch`).
 * A flow starts with {@link authorizationRedirect}, which sends the user to Discord and remembers
 * the flow's state in a short-lived cookie, and ends on the callback with {@link exchangeCode},
 * which checks the state and trades the code for tokens. Each started flow gets a cookie of its
 * own (`<name>:<uuid>`, value `state=<state>&<state>=<code verifier>`) so tabs logging in at the
 * same time don't overwrite each other's state.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { add } from "date-fns";
import * as v from "valibot";
import { Config } from "~/config";
import { ServerConfig } from "~/config.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";

const AUTHORIZATION_ENDPOINT = "https://discord.com/api/oauth2/authorize";
const TOKEN_ENDPOINT = "https://discord.com/api/v10/oauth2/token";
const STATE_COOKIE_MAX_AGE_SECONDS = 5 * 60;
const STATE_KEY = "state";

const tokenResponseSchema = v.object({
	access_token: v.string(),
	refresh_token: v.string(),
	expires_in: v.number(),
});
const errorResponseSchema = v.object({
	error: v.string(),
	error_description: v.optional(v.string()),
});

export interface Flow {
	scopes: string[];
	/** Path Discord redirects back to, registered in the Discord developer portal. */
	callbackPath: string;
	/** Proves the code is redeemed by whoever started the flow. Discord rejects it with some scopes (`role_connections.write`, discord-api-docs#5751). */
	pkce: boolean;
	stateCookie: { name: string; path: string };
}

export interface Tokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: Date;
}

/** Discord turned the flow down, `code` as Discord gave it (e.g. `access_denied`, `invalid_grant`). */
export class OAuthError extends Error {
	readonly code: string;

	constructor(code: string, description?: string) {
		super(
			`Discord OAuth error: ${code}${description ? ` (${description})` : ""}`,
		);
		this.code = code;
	}
}

/** The callback came without the state cookie: the browser blocked it or the flow took longer than five minutes. */
export class MissingStateError extends Error {
	constructor() {
		super("Missing OAuth state cookie");
	}
}

/** Discord's token endpoint answered with an unexpected status (e.g. 429 when rate limited). */
export class TokenRequestError extends Error {
	readonly status: number;

	constructor(status: number) {
		super(`Discord token request failed with status code ${status}`);
		this.status = status;
	}
}

/**
 * Starts the flow: a redirect to Discord's consent screen that sets the flow's state cookie.
 * `prompt: "none"` skips the consent screen for users who already authorized the app.
 */
export function authorizationRedirect(
	flow: Flow,
	{ prompt }: { prompt?: "none" } = {},
) {
	const state = randomBase64Url();
	const codeVerifier = randomBase64Url();

	const url = new URL(AUTHORIZATION_ENDPOINT);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", ServerConfig.discord.clientId);
	url.searchParams.set("redirect_uri", redirectUri(flow));
	url.searchParams.set("state", state);
	if (flow.pkce) {
		url.searchParams.set("code_challenge_method", "S256");
		url.searchParams.set(
			"code_challenge",
			createHash("sha256").update(codeVerifier).digest("base64url"),
		);
	}
	url.searchParams.set("scope", flow.scopes.join(" "));
	if (prompt) url.searchParams.set("prompt", prompt);

	const headers = new Headers({ Location: url.toString() });
	headers.append(
		"Set-Cookie",
		stateCookieHeader({ flow, state, codeVerifier }),
	);

	return new Response(null, { status: 302, headers });
}

/**
 * Finishes the flow on its callback: checks the state against the flow's state cookie and
 * exchanges the code for tokens. Throws {@link OAuthError} when Discord turned it down,
 * {@link MissingStateError} without the state cookie.
 */
export async function exchangeCode(request: Request, flow: Flow) {
	const params = callbackParams(request);
	if (params.error) throw new OAuthError(params.error);

	const storedVerifiers = storedCodeVerifiers(request, flow);
	if (storedVerifiers.size === 0) throw new MissingStateError();

	const codeVerifier = params.state
		? storedVerifiers.get(params.state)
		: undefined;
	if (!codeVerifier) {
		throw new Error("OAuth state doesn't match the state cookie");
	}
	if (!params.code) throw new Error("Missing code in the OAuth callback");

	return requestTokens({
		grant_type: "authorization_code",
		code: params.code,
		redirect_uri: redirectUri(flow),
		...(flow.pkce ? { code_verifier: codeVerifier } : {}),
	});
}

/** New tokens for the refresh token. Throws {@link OAuthError} `invalid_grant` once Discord no longer accepts it. */
export function refreshTokens(flow: Flow, refreshToken: string) {
	return requestTokens({
		grant_type: "refresh_token",
		refresh_token: refreshToken,
		scope: flow.scopes.join(" "),
	});
}

function redirectUri(flow: Flow) {
	return new URL(flow.callbackPath, Config.siteDomain).toString();
}

function randomBase64Url() {
	return randomBytes(32).toString("base64url");
}

function stateCookieHeader({
	flow,
	state,
	codeVerifier,
}: {
	flow: Flow;
	state: string;
	codeVerifier: string;
}) {
	const value = new URLSearchParams([
		[STATE_KEY, state],
		[state, codeVerifier],
	]).toString();
	const isSecureContext = ServerConfig.isProduction && !IS_E2E_TEST_RUN;

	return [
		`${flow.stateCookie.name}:${randomUUID()}=${value}`,
		`Max-Age=${STATE_COOKIE_MAX_AGE_SECONDS}`,
		`Path=${flow.stateCookie.path}`,
		"HttpOnly",
		"SameSite=Lax",
		...(isSecureContext ? ["Secure"] : []),
	].join("; ");
}

function storedCodeVerifiers(request: Request, flow: Flow) {
	const result = new Map<string, string>();

	for (const cookie of (request.headers.get("Cookie") ?? "").split(";")) {
		const separatorIndex = cookie.indexOf("=");
		if (separatorIndex === -1) continue;

		const name = cookie.slice(0, separatorIndex).trim();
		if (!name.startsWith(`${flow.stateCookie.name}:`)) continue;

		const value = cookie.slice(separatorIndex + 1).trim();
		for (const [state, codeVerifier] of new URLSearchParams(value)) {
			if (state !== STATE_KEY) result.set(state, codeVerifier);
		}
	}

	return result;
}

function callbackParams(request: Request) {
	const { searchParams } = new URL(request.url);

	// biome-ignore-start lint/plugin: OAuth callback params, their names and values defined by the provider
	return {
		code: searchParams.get("code"),
		state: searchParams.get("state"),
		error: searchParams.get("error"),
	};
	// biome-ignore-end lint/plugin: OAuth callback params, their names and values defined by the provider
}

async function requestTokens(body: Record<string, string>): Promise<Tokens> {
	const credentials = Buffer.from(
		`${ServerConfig.discord.clientId}:${ServerConfig.discord.clientSecret}`,
	).toString("base64");

	const response = await fetch(TOKEN_ENDPOINT, {
		method: "POST",
		body: new URLSearchParams(body),
		headers: {
			Authorization: `Basic ${credentials}`,
			Accept: "application/json",
		},
	});

	const json = await response.json().catch(() => null);

	if (!response.ok) {
		const error = v.safeParse(errorResponseSchema, json);
		if (error.success) {
			throw new OAuthError(error.output.error, error.output.error_description);
		}

		throw new TokenRequestError(response.status);
	}

	const tokens = v.parse(tokenResponseSchema, json);

	return {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: add(new Date(), { seconds: tokens.expires_in }),
	};
}
