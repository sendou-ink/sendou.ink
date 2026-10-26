import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { assertE2EFlagSafe, requiredInProd } from "./config-helpers";

describe("requiredInProd", () => {
	test.each([
		{ why: "dev, missing", isProd: false, value: undefined, ok: true },
		{ why: "dev, dev default", isProd: false, value: "secret", ok: true },
		{ why: "prod, missing", isProd: true, value: undefined, ok: false },
		{ why: "prod, dev default", isProd: true, value: "secret", ok: false },
		{ why: "prod, real value", isProd: true, value: "s3cr3t-value", ok: true },
	])("rejectDevFallback: $why", ({ isProd, value, ok }) => {
		const schema = requiredInProd(isProd, "secret", {
			rejectDevFallback: true,
		});

		expect(v.safeParse(schema, value).success).toBe(ok);
	});

	test("accepts the dev default in production without rejectDevFallback", () => {
		expect(
			v.safeParse(requiredInProd(true, "db.sqlite3"), "db.sqlite3").success,
		).toBe(true);
	});
});

describe("assertE2EFlagSafe", () => {
	test.each([
		{ why: "undefined domain", siteDomain: undefined, throws: true },
		{ why: "unparseable domain", siteDomain: "not a url", throws: true },
		{ why: "localhost", siteDomain: "http://localhost:5173", throws: false },
		{ why: "loopback ip", siteDomain: "http://127.0.0.1", throws: false },
		{ why: "real domain", siteDomain: "https://sendou.ink", throws: true },
		{
			why: "localhost-prefixed domain",
			siteDomain: "https://localhost.evil.com",
			throws: true,
		},
	])("production with e2e flag: $why", ({ siteDomain, throws }) => {
		const assert = () =>
			assertE2EFlagSafe({ nodeEnv: "production", isE2E: true, siteDomain });

		if (throws) {
			expect(assert).toThrow();
		} else {
			expect(assert).not.toThrow();
		}
	});

	test.each([
		{ why: "development with e2e flag", nodeEnv: "development", isE2E: true },
		{ why: "production without e2e flag", nodeEnv: "production", isE2E: false },
	])("does not throw: $why", ({ nodeEnv, isE2E }) => {
		expect(() =>
			assertE2EFlagSafe({
				nodeEnv,
				isE2E,
				siteDomain: "https://sendou.ink",
			}),
		).not.toThrow();
	});
});
