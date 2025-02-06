import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MainWeaponId } from "~/modules/in-game-lists";
import { dbInsertUsers, dbReset, wrappedAction } from "~/utils/Test";
import {
	action as editUserProfileAction,
	type userEditActionSchema,
} from "./u.$identifier.edit";

const action = wrappedAction<typeof userEditActionSchema>({
	action: editUserProfileAction,
});

const DEFAULT_FIELDS = {
	battlefy: null,
	bio: null,
	commissionsOpen: 1,
	commissionText: null,
	country: "FI",
	customName: null,
	customUrl: null,
	favoriteBadgeId: null,
	inGameNameDiscriminator: null,
	inGameNameText: null,
	motionSens: null,
	showDiscordUniqueName: 1,
	stickSens: null,
	weapons: JSON.stringify([
		{ weaponSplId: 1 as MainWeaponId, isFavorite: 0 },
	]) as any,
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
				css: JSON.stringify({ bg: "#fff" }),
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { identifier: "2" } },
		);

		expect(response.status).toBe(302);
	});

	it("prevents adding custom css var of unknown property", async () => {
		const res = await action(
			{
				css: JSON.stringify({
					"backdrop-filter": "#fff",
				}),
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { identifier: "2" } },
		);

		expect(res.errors[0]).toBe("Invalid custom CSS var object");
	});

	it("prevents adding custom css var of unknown value", async () => {
		const res = await action(
			{
				css: JSON.stringify({
					bg: "url(https://sendou.ink/u?q=1&_data=features%2Fuser-search%2Froutes%2Fu)",
				}),
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { identifier: "2" } },
		);

		expect(res.errors[0]).toBe("Invalid custom CSS var object");
	});
});
