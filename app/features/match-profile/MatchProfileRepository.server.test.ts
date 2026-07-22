import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { db } from "~/db/sql";
import type { UserMapModePreferences } from "~/db/tables";
import { dbInsertUsers, dbReset, withUserId } from "~/utils/Test";
import * as MatchProfileRepository from "./MatchProfileRepository.server";

const USER_ID = 1;

const PREFERENCES: UserMapModePreferences = {
	modes: [{ mode: "SZ", preference: "PREFER" }],
	pool: [{ mode: "SZ", stages: [1, 2, 3, 4] }],
};

const OTHER_PREFERENCES: UserMapModePreferences = {
	modes: [{ mode: "SZ", preference: "PREFER" }],
	pool: [{ mode: "SZ", stages: [5, 6, 7, 8] }],
};

const updateProfile = (
	args: Partial<
		Parameters<typeof MatchProfileRepository.updateOwnMatchProfile>[0]
	> = {},
) =>
	withUserId(USER_ID, () =>
		MatchProfileRepository.updateOwnMatchProfile({
			mapModePreferences: PREFERENCES,
			vc: "NO",
			languages: [],
			weaponPool: [],
			noScreen: 0,
			...args,
		}),
	);

describe("updateOwnMatchProfile", () => {
	beforeEach(async () => {
		await dbInsertUsers(1);
		await db
			.updateTable("User")
			.set({ mapModePreferences: JSON.stringify(PREFERENCES), noScreen: 0 })
			.where("id", "=", USER_ID)
			.execute();
	});

	afterEach(() => {
		dbReset();
	});

	test("reports no change when nothing matchmaking-relevant changed", async () => {
		const result = await updateProfile({ vc: "YES", languages: ["en"] });

		expect(result.mapModePreferencesChanged).toBe(false);
		expect(result.noScreenChanged).toBe(false);
	});

	test("detects a noScreen change", async () => {
		const result = await updateProfile({ noScreen: 1 });

		expect(result.noScreenChanged).toBe(true);
		expect(result.mapModePreferencesChanged).toBe(false);
	});

	test("detects a map/mode preferences change", async () => {
		const result = await updateProfile({
			mapModePreferences: OTHER_PREFERENCES,
		});

		expect(result.mapModePreferencesChanged).toBe(true);
		expect(result.noScreenChanged).toBe(false);
	});
});
