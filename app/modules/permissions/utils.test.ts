import { beforeEach, describe, expect, test, vi } from "vitest";
import { ADMIN_ID } from "~/features/admin/admin-constants";

const e2e = vi.hoisted(() => ({ isTestRun: false }));

vi.mock("~/utils/e2e", () => ({
	get IS_E2E_TEST_RUN() {
		return e2e.isTestRun;
	},
}));

import { hasPermission } from "./utils";

const REGULAR_USER_ID = ADMIN_ID + 1;
const OTHER_USER_ID = ADMIN_ID + 2;

const entity = { permissions: { EDIT: [REGULAR_USER_ID] } };

describe("hasPermission", () => {
	beforeEach(() => {
		e2e.isTestRun = false;
		vi.unstubAllEnvs();
	});

	test("returns false for a logged out user", () => {
		expect(hasPermission(entity, "EDIT", null)).toBe(false);
	});

	test("returns true for a user holding the permission", () => {
		expect(hasPermission(entity, "EDIT", { id: REGULAR_USER_ID })).toBe(true);
	});

	test("returns false for a user not holding the permission", () => {
		expect(hasPermission(entity, "EDIT", { id: OTHER_USER_ID })).toBe(false);
	});

	test("admin does not bypass the permission outside production", () => {
		expect(hasPermission(entity, "EDIT", { id: ADMIN_ID })).toBe(false);
	});

	test("admin bypasses the permission in production", () => {
		vi.stubEnv("NODE_ENV", "production");

		expect(hasPermission(entity, "EDIT", { id: ADMIN_ID })).toBe(true);
	});

	test("admin does not bypass the permission in an e2e test run", () => {
		vi.stubEnv("NODE_ENV", "production");
		e2e.isTestRun = true;

		expect(hasPermission(entity, "EDIT", { id: ADMIN_ID })).toBe(false);
	});
});
