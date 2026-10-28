import { createCookieSessionStorage, type SessionStorage } from "react-router";
import { ServerConfig } from "~/config.server";
import { IS_E2E_TEST_RUN } from "~/utils/e2e";

const ONE_YEAR_IN_SECONDS = 31_536_000;
const LEGACY_COOKIE_NAME = "__session";
const LEGACY_COOKIE_DOMAIN = "sendou.ink";

const authSession = createAuthSession({
	isSecureContext: ServerConfig.isProduction && !IS_E2E_TEST_RUN,
	secret: ServerConfig.sessionSecret,
});

export const AUTH_SESSION_COOKIE_NAME = authSession.cookieName;
export const authSessionStorage = authSession.storage;
export const legacySessionMigrationCookies =
	authSession.legacySessionMigrationCookies;

/**
 * Creates the auth session storage. In a secure context the cookie is host-only (`__Host-` prefix: Secure, `Path=/`, no `Domain`).
 *
 * Sessions issued before the switch live in a `Domain=sendou.ink` cookie. They are still read when no host-only cookie is present,
 * and `legacySessionMigrationCookies` returns the `Set-Cookie` values that re-issue such a session host-only and expire the old cookie.
 */
export function createAuthSession({
	isSecureContext,
	secret,
}: {
	isSecureContext: boolean;
	secret: string;
}) {
	const cookieName = isSecureContext ? "__Host-session" : LEGACY_COOKIE_NAME;

	const hostOnlyStorage = createCookieSessionStorage({
		cookie: {
			name: cookieName,
			sameSite: "lax",
			path: "/",
			httpOnly: true,
			secrets: [secret],
			secure: isSecureContext,
			maxAge: ONE_YEAR_IN_SECONDS,
		},
	});

	// TODO: remove legacy cookie migration after 2027-01 (anyone not migrated by then just logs in again)
	const legacyStorage = isSecureContext
		? createCookieSessionStorage({
				cookie: {
					name: LEGACY_COOKIE_NAME,
					domain: LEGACY_COOKIE_DOMAIN,
					sameSite: "lax",
					path: "/",
					httpOnly: true,
					secrets: [secret],
					secure: true,
				},
			})
		: null;

	const readsLegacyCookie = (cookieHeader: string | null | undefined) =>
		legacyStorage !== null &&
		hasCookie(cookieHeader, LEGACY_COOKIE_NAME) &&
		!hasCookie(cookieHeader, cookieName);

	const storage: SessionStorage = {
		getSession: async (cookieHeader, options) => {
			if (!legacyStorage || !readsLegacyCookie(cookieHeader)) {
				return hostOnlyStorage.getSession(cookieHeader, options);
			}

			const legacySession = await legacyStorage.getSession(
				cookieHeader,
				options,
			);
			const session = await hostOnlyStorage.getSession();
			for (const [key, value] of Object.entries(legacySession.data)) {
				session.set(key, value);
			}

			return session;
		},
		commitSession: hostOnlyStorage.commitSession,
		destroySession: hostOnlyStorage.destroySession,
	};

	const migrationCookies = async (
		cookieHeader: string | null,
	): Promise<{ hostOnly: string | null; expireLegacy: string } | null> => {
		if (!legacyStorage || !hasCookie(cookieHeader, LEGACY_COOKIE_NAME)) {
			return null;
		}

		const expireLegacy = await legacyStorage.destroySession(
			await legacyStorage.getSession(),
		);

		if (!readsLegacyCookie(cookieHeader)) {
			return { hostOnly: null, expireLegacy };
		}

		const session = await storage.getSession(cookieHeader);
		const hostOnly =
			Object.keys(session.data).length > 0
				? await hostOnlyStorage.commitSession(session)
				: null;

		return { hostOnly, expireLegacy };
	};

	return {
		cookieName,
		storage,
		legacySessionMigrationCookies: migrationCookies,
	};
}

function hasCookie(cookieHeader: string | null | undefined, name: string) {
	if (!cookieHeader) return false;

	return cookieHeader
		.split(";")
		.some((cookie) => cookie.trim().startsWith(`${name}=`));
}
