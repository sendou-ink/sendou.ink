import { createCookieSessionStorage } from "react-router";
import { describe, expect, test } from "vitest";
import { createAuthSession } from "./session.server";

const SECRET = "test-secret";

const secureAuthSession = createAuthSession({
	isSecureContext: true,
	secret: SECRET,
});

const legacyStorage = createCookieSessionStorage({
	cookie: {
		name: "__session",
		domain: "sendou.ink",
		path: "/",
		httpOnly: true,
		secrets: [SECRET],
		secure: true,
	},
});

const legacyCookieHeader = async (data: Record<string, unknown>) => {
	const session = await legacyStorage.getSession();
	for (const [key, value] of Object.entries(data)) {
		session.set(key, value);
	}
	return toCookieHeader(await legacyStorage.commitSession(session));
};

const hostOnlyCookieHeader = async (data: Record<string, unknown>) => {
	const session = await secureAuthSession.storage.getSession();
	for (const [key, value] of Object.entries(data)) {
		session.set(key, value);
	}
	return toCookieHeader(await secureAuthSession.storage.commitSession(session));
};

describe("createAuthSession", () => {
	test("issues a host-only __Host- cookie in a secure context", async () => {
		const session = await secureAuthSession.storage.getSession();
		session.set("user", 1);

		const setCookie = await secureAuthSession.storage.commitSession(session);

		expect(setCookie.startsWith("__Host-session=")).toBe(true);
		expect(setCookie).toContain("Secure");
		expect(setCookie).toContain("Path=/");
		expect(setCookie).not.toContain("Domain");
	});

	test("keeps the plain cookie name outside a secure context", () => {
		const authSession = createAuthSession({
			isSecureContext: false,
			secret: SECRET,
		});

		expect(authSession.cookieName).toBe("__session");
	});

	test("reads the session from the legacy domain cookie when no host-only cookie exists", async () => {
		const session = await secureAuthSession.storage.getSession(
			await legacyCookieHeader({ user: 1 }),
		);

		expect(session.get("user")).toBe(1);
	});

	test("prefers the host-only cookie over the legacy cookie", async () => {
		const cookieHeader = `${await legacyCookieHeader({ user: 1 })}; ${await hostOnlyCookieHeader({ user: 2 })}`;

		const session = await secureAuthSession.storage.getSession(cookieHeader);

		expect(session.get("user")).toBe(2);
	});
});

describe("legacySessionMigrationCookies", () => {
	test("returns null without a legacy cookie", async () => {
		const result = await secureAuthSession.legacySessionMigrationCookies(
			await hostOnlyCookieHeader({ user: 1 }),
		);

		expect(result).toBeNull();
	});

	test("returns null outside a secure context", async () => {
		const authSession = createAuthSession({
			isSecureContext: false,
			secret: SECRET,
		});

		const result = await authSession.legacySessionMigrationCookies(
			await legacyCookieHeader({ user: 1 }),
		);

		expect(result).toBeNull();
	});

	test("re-issues the legacy session host-only and expires the legacy domain cookie", async () => {
		const result = await secureAuthSession.legacySessionMigrationCookies(
			await legacyCookieHeader({ user: 1, impersonated_user: 2 }),
		);

		const migrated = await secureAuthSession.storage.getSession(
			toCookieHeader(result!.hostOnly!),
		);
		expect(migrated.get("user")).toBe(1);
		expect(migrated.get("impersonated_user")).toBe(2);
		expect(result!.expireLegacy.startsWith("__session=;")).toBe(true);
		expect(result!.expireLegacy).toContain("Domain=sendou.ink");
		expect(result!.expireLegacy).toContain("Expires=Thu, 01 Jan 1970");
	});

	test("only expires the legacy cookie when a host-only cookie already exists", async () => {
		const cookieHeader = `${await legacyCookieHeader({ user: 1 })}; ${await hostOnlyCookieHeader({ user: 2 })}`;

		const result =
			await secureAuthSession.legacySessionMigrationCookies(cookieHeader);

		expect(result?.hostOnly).toBeNull();
		expect(result?.expireLegacy).toContain("Domain=sendou.ink");
	});

	test("does not issue a host-only cookie for an empty legacy session", async () => {
		const result = await secureAuthSession.legacySessionMigrationCookies(
			await legacyCookieHeader({}),
		);

		expect(result?.hostOnly).toBeNull();
		expect(result?.expireLegacy).toContain("Domain=sendou.ink");
	});
});

function toCookieHeader(setCookie: string) {
	return setCookie.split(";")[0];
}
