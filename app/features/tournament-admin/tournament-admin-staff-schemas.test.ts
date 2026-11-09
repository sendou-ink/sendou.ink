import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { adminStaffFormSchema } from "./tournament-admin-staff-schemas";

const POOL_CAPTAIN_STAFF = {
	staff: [{ userId: 1, role: "POOL_CAPTAIN" as const }],
};

describe("adminStaffFormSchema", () => {
	test.each([
		{ why: "a LAN", isLan: true, success: true },
		{ why: "an online tournament", isLan: false, success: false },
	])("pool captain in $why: $success", ({ isLan, success }) => {
		const result = v.safeParse(
			adminStaffFormSchema({ isLan }),
			POOL_CAPTAIN_STAFF,
		);

		expect(result.success).toBe(success);
	});
});
