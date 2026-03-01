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
	pronouns: { subject: null, object: null },
	weapons: [{ id: 1 as MainWeaponId, isFavorite: false }],
	showDiscordUniqueName: true,
	newProfileEnabled: false,
	css: null,
};

describe("user page editing", () => {
	beforeEach(async () => {
		await dbInsertUsers();
	});
	afterEach(() => {
		dbReset();
	});

	it("adds valid custom css vars", async () => {
		const response = await action(
			{
				...DEFAULT_FIELDS,
				css: { bg: "#fff" },
			},
			{ user: "regular", params: { identifier: "2" } },
		);

		expect(response.status).toBe(302);
	});

	it("prevents adding custom css var of unknown property", async () => {
		const res = await action(
			{
				...DEFAULT_FIELDS,
				css: {
					"backdrop-filter": "#fff",
				} as any,
			},
			{ user: "regular", params: { identifier: "2" } },
		);

		expect(res.fieldErrors.css).toBeDefined();
	});

	it("prevents adding custom css var of unknown value", async () => {
		const res = await action(
			{
				...DEFAULT_FIELDS,
				css: {
					bg: "url(https://sendou.ink/u?q=1&_data=features%2Fuser-search%2Froutes%2Fu)",
				},
			},
			{ user: "regular", params: { identifier: "2" } },
		);

		expect(res.fieldErrors.css).toBeDefined();
	});
});
