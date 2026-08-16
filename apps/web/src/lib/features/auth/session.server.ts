import { createHmac, timingSafeEqual } from "node:crypto";
import { ServerConfig } from "#lib/server/config.ts";
import { IS_E2E_TEST_RUN } from "#lib/utils/e2e.ts";

/**
 * The auth session cookie, byte-compatible with the React app's
 * `createCookieSessionStorage` cookie (name, JSON→base64 encoding and HMAC
 * signature all identical) so that nobody gets logged out at cutover.
 */

export const AUTH_COOKIE_NAME = "__session";
export const SESSION_KEY = "user";
export const IMPERSONATED_SESSION_KEY = "impersonated_user";

const ONE_YEAR_IN_SECONDS = 31_536_000;

export type SessionData = Record<string, unknown>;

/** Decodes and verifies the auth session cookie value. Returns `null` for missing, tampered or malformed cookies. */
export function readSessionCookie(
	cookieValue: string | undefined,
): SessionData | null {
	if (!cookieValue) return null;

	const unsigned = unsign(cookieValue, ServerConfig.sessionSecret);
	if (unsigned === false) return null;

	return decodeData(unsigned);
}

/** Encodes and signs session data into the auth cookie value. */
export function writeSessionCookie(data: SessionData): string {
	return sign(encodeData(data), ServerConfig.sessionSecret);
}

export const authCookieOptions = {
	sameSite: "lax",
	domain:
		ServerConfig.isProduction && !IS_E2E_TEST_RUN ? "sendou.ink" : undefined,
	path: "/",
	httpOnly: true,
	secure: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
	maxAge: ONE_YEAR_IN_SECONDS,
} as const;

/** Resolves the acting user id of a session: the impersonated user when impersonating, otherwise the logged in user. */
export function sessionUserId(session: SessionData | null): number | null {
	if (!session) return null;

	const userId = session[IMPERSONATED_SESSION_KEY] ?? session[SESSION_KEY];
	return typeof userId === "number" ? userId : null;
}

function sign(value: string, secret: string) {
	const signature = createHmac("sha256", secret)
		.update(value)
		.digest("base64")
		.replace(/=+$/, "");

	return `${value}.${signature}`;
}

function unsign(cookie: string, secret: string): string | false {
	const index = cookie.lastIndexOf(".");
	if (index < 0) return false;

	const value = cookie.slice(0, index);
	const hash = cookie.slice(index + 1);

	const expected = createHmac("sha256", secret)
		.update(value)
		.digest("base64")
		.replace(/=+$/, "");

	const hashBuffer = Buffer.from(hash);
	const expectedBuffer = Buffer.from(expected);
	if (hashBuffer.length !== expectedBuffer.length) return false;

	return timingSafeEqual(hashBuffer, expectedBuffer) ? value : false;
}

function encodeData(value: SessionData): string {
	return btoa(myUnescape(encodeURIComponent(JSON.stringify(value))));
}

function decodeData(value: string): SessionData {
	try {
		const parsed = JSON.parse(decodeURIComponent(myEscape(atob(value))));
		return typeof parsed === "object" && parsed !== null ? parsed : {};
	} catch {
		return {};
	}
}

// escape/unescape ported from React Router's cookie encoding (which follows
// core-js's escape/unescape) so multibyte session values round-trip identically
function myEscape(value: string): string {
	let result = "";
	let index = 0;
	while (index < value.length) {
		const chr = value.charAt(index++);
		if (/[\w*+\-./@]/.exec(chr)) {
			result += chr;
		} else {
			const code = chr.charCodeAt(0);
			if (code < 256) {
				result += `%${hex(code, 2)}`;
			} else {
				result += `%u${hex(code, 4).toUpperCase()}`;
			}
		}
	}
	return result;
}

function hex(code: number, length: number): string {
	let result = code.toString(16);
	while (result.length < length) result = `0${result}`;
	return result;
}

function myUnescape(value: string): string {
	let result = "";
	let index = 0;
	while (index < value.length) {
		let chr = value.charAt(index++);
		if (chr === "%") {
			if (value.charAt(index) === "u") {
				const part = value.slice(index + 1, index + 5);
				if (/^[\da-f]{4}$/i.exec(part)) {
					result += String.fromCharCode(Number.parseInt(part, 16));
					index += 5;
					continue;
				}
			} else {
				const part = value.slice(index, index + 2);
				if (/^[\da-f]{2}$/i.exec(part)) {
					result += String.fromCharCode(Number.parseInt(part, 16));
					index += 2;
					continue;
				}
			}
		}
		result += chr;
	}
	return result;
}
