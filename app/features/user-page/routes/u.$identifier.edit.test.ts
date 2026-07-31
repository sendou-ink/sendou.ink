import { beforeEach, describe, expect, it } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { wrappedAction } from "~/utils/Test";
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
	customAvatar: null,
	customName: null,
	customUrl: null,
	favoriteBadgeIds: [],
	favoriteTrophyIds: [],
	hiddenTrophyIds: [],
	inGameName: null,
	sensitivity: [null, null] as [null, null],
	pronouns: [null, null] as [null, null],
	weapons: [{ id: 1 as MainWeaponId, isFavorite: false }],
	showDiscordUniqueName: true,
	newProfileEnabled: false,
};

describe("user page editing", () => {
	let userId: number;

	beforeEach(async () => {
		userId = (await UserFactory.createRegular()).id;
	});

	it("saves profile with default fields", async () => {
		const response = await action(
			{
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { identifier: String(userId) } },
		);

		expect(response.status).toBe(302);
	});
});
