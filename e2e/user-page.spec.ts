import { NZAP_TEST_DISCORD_ID, NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_DISCORD_ID, ADMIN_ID } from "~/features/admin/admin-constants";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { SettingsPage } from "./pages/settings/settings-page";
import { UserEditProfilePage } from "./pages/user/user-edit-profile-page";
import { UserPage } from "./pages/user/user-page";

test.describe("User page", () => {
	test("uses badge pagination", async ({ page, factories }) => {
		await factories.BadgeFactory.create(
			{ displayName: "Sunken Scroll" },
			{ ownerIds: [NZAP_TEST_ID] },
		);
		// enough badges for two pages: 1 big + 9 small on the first page
		await factories.BadgeFactory.createMany(
			12,
			(index) => ({ displayName: `Badge ${index + 1}` }),
			{ ownerIds: [ADMIN_ID] },
		);

		const userPage = new UserPage(page);
		await userPage.goto(NZAP_TEST_DISCORD_ID);

		await expect(userPage.locators.badgeDisplay).toBeVisible();
		await isNotVisible(userPage.locators.badgePaginationButtons);

		await userPage.goto(ADMIN_DISCORD_ID);

		// badges are shown newest first, so the last created one is the big badge
		await expect(userPage.badgeImage("Badge 12")).toBeVisible();
		await userPage.locators.badgePaginationButtons.nth(1).click();

		// test changing the big badge
		await userPage.badgeImage("Badge 1").click();
		await expect(userPage.badgeImage("Badge 1")).toHaveAttribute(
			"width",
			"125",
		);
	});

	test("customize which badge is shown as big by default as normal user", async ({
		page,
		factories,
	}) => {
		const [firstBadge] = await factories.BadgeFactory.createMany(
			2,
			(index) => ({ displayName: `Badge ${index + 1}` }),
			{ ownerIds: [NZAP_TEST_ID] },
		);

		await impersonate(page, NZAP_TEST_ID);

		const editProfile = new UserEditProfilePage(page);
		await editProfile.goto(NZAP_TEST_DISCORD_ID);

		await editProfile.selectFavoriteBadge(firstBadge.id);
		await editProfile.save();

		const userPage = new UserPage(page);
		await userPage.goto(NZAP_TEST_DISCORD_ID);
		await expect(userPage.badgeImage("Badge 1")).toHaveAttribute(
			"width",
			"125",
		);
	});

	test("customize big badge + small badge first page order as supporter", async ({
		page,
		factories,
	}) => {
		const badges = await factories.BadgeFactory.createMany(
			3,
			(index) => ({ displayName: `Badge ${index + 1}` }),
			{ ownerIds: [ADMIN_ID] },
		);
		await factories.UserFactory.grant(ADMIN_ID, { patronTier: 2 });

		await impersonate(page);

		const editProfile = new UserEditProfilePage(page);
		await editProfile.goto(ADMIN_DISCORD_ID);

		await editProfile.selectFavoriteBadge(badges[0].id);
		await expect(editProfile.locators.badgeDisplay).toBeVisible();
		await editProfile.selectFavoriteBadge(badges[1].id);
		await editProfile.save();

		const userPage = new UserPage(page);
		await userPage.goto(ADMIN_DISCORD_ID);
		await expect(userPage.badgeImage("Badge 1")).toHaveAttribute(
			"width",
			"125",
		);
		await expect(userPage.badgeImage("Badge 2")).toBeVisible();
	});

	test("edits user profile", async ({ page, factories }) => {
		await factories.UserFactory.updateProfile(ADMIN_ID, { country: "FI" });

		await impersonate(page);

		const userPage = new UserPage(page);
		await userPage.goto(ADMIN_DISCORD_ID);

		await expect(userPage.flag("FI")).toBeVisible();
		const editProfile = await userPage.openEditProfile();

		await editProfile.form.fill("inGameName", "Lean#1234");
		await editProfile.selectStickSens("0");
		await editProfile.selectMotionSens("-50");
		await editProfile.selectCountry("Sweden");
		await editProfile.form.fill("bio", "My awesome bio");
		await editProfile.save();

		await expect(userPage.flag("SE")).toBeVisible();
		await expect(userPage.text("My awesome bio")).toBeVisible();
		await expect(userPage.text("Lean#1234")).toBeVisible();
		await expect(userPage.text("Motion -5 / Stick 0")).toBeVisible();
	});

	test("customizes theme colors and resets them", async ({
		page,
		factories,
	}) => {
		// custom theme colors are a supporter perk
		await factories.UserFactory.grant(ADMIN_ID, { patronTier: 2 });

		await impersonate(page);

		const settings = new SettingsPage(page);
		await settings.goto("theme");

		// initially no custom theme
		await expect(settings.hasCustomTheme()).resolves.toBe(false);

		await settings.setBaseHue("120");
		await settings.saveTheme();
		await settings.reload();

		// verify custom theme was applied
		await expect(settings.hasCustomTheme()).resolves.toBe(true);

		await settings.resetTheme();
		await settings.reload();

		// verify custom theme was removed
		await expect(settings.hasCustomTheme()).resolves.toBe(false);
	});

	test("edits weapon pool", async ({ page, factories }) => {
		await factories.UserFactory.grant(ADMIN_ID, {
			weapons: ([200, 1100, 2000, 4000] as const).map((weaponSplId) => ({
				weaponSplId,
				isFavorite: 0 as const,
			})),
		});

		await impersonate(page);

		const userPage = new UserPage(page);
		await userPage.goto(ADMIN_DISCORD_ID);

		for (const [i, id] of [200, 1100, 2000, 4000].entries()) {
			await expect(userPage.weaponPoolImage(id, i + 1)).toBeVisible();
		}

		const editProfile = await userPage.openEditProfile();

		await editProfile.form.selectWeapons("weapons", ["Range Blaster"]);
		await editProfile.deleteWeapon(/Inkbrush/);
		await editProfile.save();

		for (const [i, id] of [200, 2000, 4000, 220].entries()) {
			await expect(userPage.weaponPoolImage(id, i + 1)).toBeVisible();
		}
	});
});
