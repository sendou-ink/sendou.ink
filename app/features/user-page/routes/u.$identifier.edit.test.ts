import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { dbInsertUsers, dbReset, wrappedAction } from "~/utils/Test";
import type { userEditProfileBaseSchema } from "../user-page-schemas";
import { action as editUserProfileAction } from "./u.$identifier.edit";

const action = wrappedAction<typeof userEditProfileBaseSchema>({
	action: editUserProfileAction,
	isJsonSubmission: true,
});

const DEFAULT_FIELDS = {
	battlefy: null,
	bio: null,
	commissionsOpen: false,
	commissionText: null,
	country: "FI",
	customName: null,
	customUrl: null,
	favoriteBadgeIds: [],
	inGameName: null,
	sensitivity: [null, null] as [null, null],
	pronouns: [null, null] as [null, null],
	weapons: [{ id: 1 as MainWeaponId, isFavorite: false }],
	showDiscordUniqueName: true,
	newProfileEnabled: false,
};

describe("user page editing", () => {
	beforeEach(async () => {
		await dbInsertUsers();
	});
	afterEach(() => {
		dbReset();
	});

	it("saves profile with default fields", async () => {
		const response = await action(
			{
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { identifier: "2" } },
		);

		expect(response.status).toBe(302);
	});
});
