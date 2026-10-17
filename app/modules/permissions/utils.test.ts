import { afterEach, beforeEach, describe, expect, test, vi } from "bun:test";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { hasPermission } from "./utils";

const mockIsE2eTestRun = (isTestRun: boolean) => {
	vi.mock("~/utils/e2e", () => ({ IS_E2E_TEST_RUN: isTestRun }));
};

const REGULAR_USER_ID = ADMIN_ID + 1;
const OTHER_USER_ID = ADMIN_ID + 2;

const entity = { permissions: { EDIT: [REGULAR_USER_ID] } };

const originalNodeEnv = process.env.NODE_ENV;

describe("hasPermission", () => {
	beforeEach(() => {
		mockIsE2eTestRun(false);
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
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
		process.env.NODE_ENV = "production";

		expect(hasPermission(entity, "EDIT", { id: ADMIN_ID })).toBe(true);
	});

	test("admin does not bypass the permission in an e2e test run", () => {
		process.env.NODE_ENV = "production";
		mockIsE2eTestRun(true);

		expect(hasPermission(entity, "EDIT", { id: ADMIN_ID })).toBe(false);
	});
});
