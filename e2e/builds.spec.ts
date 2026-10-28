import { subDays } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	BUILDS_PAGE_SIZE,
	RECENT_PATCHES,
} from "~/features/builds/builds-constants";
import type { BuildAbilitiesTuple } from "~/modules/in-game-lists/types";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { BuildFormPage } from "./pages/builds/build-form-page";
import { BuildStatsPage } from "./pages/builds/build-stats-page";
import { BuildsPage } from "./pages/builds/builds-page";
import { PopularBuildsPage } from "./pages/builds/popular-builds-page";
import { UserBuildsPage } from "./pages/builds/user-builds-page";
import { WeaponBuildsPage } from "./pages/builds/weapon-builds-page";

const ABILITIES_WITH_ISM: BuildAbilitiesTuple = [
	["ISM", "ISM", "ISM", "ISM"],
	["SSU", "SSU", "SSU", "SSU"],
	["RSU", "RSU", "RSU", "RSU"],
];

const ABILITIES_WITHOUT_ISM: BuildAbilitiesTuple = [
	["SSU", "SSU", "SSU", "SSU"],
	["RSU", "RSU", "RSU", "RSU"],
	["QR", "QR", "QR", "QR"],
];

// per build: CB 10 AP, ISM 9 AP, SSU 19 AP, RSU 19 AP
const STATS_ABILITIES: BuildAbilitiesTuple = [
	["CB", "ISM", "ISM", "ISM"],
	["SSU", "SSU", "SSU", "SSU"],
	["RSU", "RSU", "RSU", "RSU"],
];

const OTHER_WEAPON_ABILITIES: BuildAbilitiesTuple = [
	["QR", "QR", "QR", "QR"],
	["QSJ", "QSJ", "QSJ", "QSJ"],
	["SS", "SS", "SS", "SS"],
];

test.describe("Builds", () => {
	test("adds a build", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);

		const buildForm = new BuildFormPage(page);
		await buildForm.gotoNew(NZAP_TEST_ID);

		await buildForm.form.selectWeapons("weapons", [
			"Tenta Brella",
			"Splat Brella",
		]);

		await buildForm.selectGear("HEAD", "White Headband");
		await buildForm.selectGear("CLOTHES", "Basic Tee");
		await buildForm.selectGear("SHOES", "Blue Lo-Tops");

		await buildForm.addAbility("ISM", 12);

		await buildForm.form.fill("title", "Test Build");
		await buildForm.form.fill("description", "Test Description");
		await buildForm.form.checkItems("modes", ["TC"]);

		await buildForm.form.submit();

		const userBuilds = new UserBuildsPage(page);
		await expect(userBuilds.locators.changeSortingButton).toBeVisible();

		const firstBuildCard = userBuilds.buildCard(0);

		await expect(firstBuildCard.weaponImage("Tenta Brella")).toBeVisible();
		await expect(firstBuildCard.weaponImage("Splat Brella")).toBeVisible();

		await expect(firstBuildCard.modeImage("Tower Control")).toBeVisible();
		await expect(firstBuildCard.modeImage("Splat Zones")).not.toBeVisible();

		await expect(firstBuildCard.title).toContainText("Test Build");
	});

	test("makes build private", async ({ page, factories }) => {
		// backdating one build makes the updatedAt sort deterministic
		const [olderBuild] = await factories.BuildFactory.createMany(2, {
			ownerId: ADMIN_ID,
		});
		await factories.backdate("Build", olderBuild.id, {
			updatedAt: subDays(new Date(), 1),
		});

		await impersonate(page);

		const userBuilds = new UserBuildsPage(page);
		await userBuilds.goto(ADMIN_ID);

		const buildIdBefore = await userBuilds.buildId(0);

		const buildForm = await userBuilds.editBuild(0);
		await buildForm.form.check("isPrivate");
		await buildForm.form.submit();

		await expect(userBuilds.locators.buildCards).toHaveCount(2);
		await expect(userBuilds.buildCard(0).privateIndicator).toBeVisible();

		const buildIdAfter = await userBuilds.buildId(0);
		expect(buildIdAfter).toBe(buildIdBefore);

		await impersonate(page, NZAP_TEST_ID);
		await userBuilds.goto(ADMIN_ID);
		await expect(userBuilds.locators.buildCards).toHaveCount(1);
		await expect(userBuilds.buildCard(0).privateIndicator).toHaveCount(0);
	});

	test("filters builds", async ({ page, factories }) => {
		await factories.BuildFactory.createMany(3, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
			modes: ["TC"],
			abilities: ABILITIES_WITH_ISM,
		});
		await factories.BuildFactory.createMany(2, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
			modes: ["SZ"],
			abilities: ABILITIES_WITHOUT_ISM,
		});

		await impersonate(page, NZAP_TEST_ID);

		const weaponBuilds = new WeaponBuildsPage(page);
		await new BuildsPage(page).openWeapon(40);
		await weaponBuilds.expandBuildStacks();

		await weaponBuilds.abilityToggle("Ink Saver (Main)").click();
		await expect(weaponBuilds.locators.buildCards).toHaveCount(3);

		await weaponBuilds.locators.abilityFilterTypeSelect.selectOption("HAS_NOT");
		await expect(weaponBuilds.locators.buildCards).toHaveCount(2);

		await weaponBuilds.locators.abilityFilterTypeSelect.selectOption(
			"AT_LEAST",
		);
		await expect(weaponBuilds.locators.buildCards).toHaveCount(3);

		await weaponBuilds.locators.abilityFilterTypeSelect.selectOption("AT_MOST");
		await expect(weaponBuilds.locators.buildCards).toHaveCount(2);
		await weaponBuilds.locators.abilityFilterApSelect.selectOption("19");
		await expect(weaponBuilds.locators.buildCards).toHaveCount(5);

		await weaponBuilds.abilityToggle("Ink Saver (Main)").click();
		await expect(weaponBuilds.locators.buildCards).toHaveCount(5);

		await weaponBuilds.filterOption("Tower Control").click();
		await expect(weaponBuilds.modeBadge("TC")).toHaveCount(3);
		await weaponBuilds.filterOption("Any mode").click();
		await expect(weaponBuilds.locators.buildCards).toHaveCount(5);

		await weaponBuilds
			.filterOption(new RegExp(`^Patch ${RECENT_PATCHES[0].patch}`))
			.click();
		// no change in count since all builds in test data are new
		await expect(weaponBuilds.locators.buildCards).toHaveCount(5);
	});

	test("filters a user's builds", async ({ page, factories }) => {
		await factories.BuildFactory.createMany(3, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
			abilities: ABILITIES_WITH_ISM,
		});
		await factories.BuildFactory.createMany(2, {
			ownerId: ADMIN_ID,
			weaponSplIds: [0],
			abilities: ABILITIES_WITHOUT_ISM,
		});

		await impersonate(page, NZAP_TEST_ID);

		const userBuilds = new UserBuildsPage(page);
		await userBuilds.goto(ADMIN_ID);
		await expect(userBuilds.locators.buildCards).toHaveCount(5);

		await userBuilds.filterOption(/^Sploosh-o-matic/).click();
		await expect(userBuilds.locators.buildCards).toHaveCount(2);

		await userBuilds.filterOption(/^Any weapon/).click();
		await userBuilds.abilityToggle("Ink Saver (Main)").click();
		await expect(userBuilds.locators.buildCards).toHaveCount(3);
	});

	test("paginates a user's builds", async ({ page, factories }) => {
		await factories.BuildFactory.createMany(BUILDS_PAGE_SIZE + 1, {
			ownerId: ADMIN_ID,
		});

		const userBuilds = new UserBuildsPage(page);
		await userBuilds.goto(ADMIN_ID);
		await expect(userBuilds.locators.buildCards).toHaveCount(BUILDS_PAGE_SIZE);

		await userBuilds.locators.nextPageButton.click();
		await expect(userBuilds.locators.buildCards).toHaveCount(1);
	});

	test("stacks an author's builds and expands the stack", async ({
		page,
		factories,
	}) => {
		await factories.BuildFactory.createMany(3, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
		});
		await factories.BuildFactory.create({
			ownerId: NZAP_TEST_ID,
			weaponSplIds: [40],
		});

		const weaponBuilds = new WeaponBuildsPage(page);
		await new BuildsPage(page).openWeapon(40);

		await expect(weaponBuilds.locators.buildCards).toHaveCount(2);
		await expect(weaponBuilds.locators.expandStackButtons).toHaveAccessibleName(
			"2 more builds",
		);

		await weaponBuilds.locators.expandStackButtons.click();
		await expect(weaponBuilds.locators.buildCards).toHaveCount(4);

		await weaponBuilds.locators.collapseStackButtons.click();
		await expect(weaponBuilds.locators.buildCards).toHaveCount(2);
	});

	test("aggregates builds into ability stats and popular builds", async ({
		page,
		factories,
	}) => {
		await factories.BuildFactory.createMany(3, {
			ownerId: ADMIN_ID,
			weaponSplIds: [40],
			abilities: STATS_ABILITIES,
		});
		await factories.BuildFactory.create({
			ownerId: NZAP_TEST_ID,
			weaponSplIds: [40],
			abilities: STATS_ABILITIES,
		});
		// a build for another weapon so site-wide stats differ from the weapon's
		await factories.BuildFactory.create({
			ownerId: NZAP_TEST_ID,
			weaponSplIds: [10],
			abilities: OTHER_WEAPON_ABILITIES,
		});

		const weaponBuilds = new WeaponBuildsPage(page);
		await new BuildsPage(page).openWeapon(40);
		await weaponBuilds.expandBuildStacks();
		await expect(weaponBuilds.locators.buildCards).toHaveCount(4);

		await weaponBuilds.locators.abilityStatsTab.click();

		const buildStats = new BuildStatsPage(page);
		await expect(buildStats.buildsCount(4)).toBeVisible();
		// SSU and RSU weapon averages
		await expect(buildStats.apAverage(19)).toHaveCount(2);
		// ISM weapon average
		await expect(buildStats.apAverage(9)).toHaveCount(1);
		// CB is in every Splattershot build but in 4 of the 5 builds site-wide
		await expect(
			buildStats.mainOnlyAbilityPercentages({
				abilityName: "Comeback",
				weaponPercentage: 100,
				allPercentage: 80,
			}),
		).toBeVisible();

		const popularBuilds = new PopularBuildsPage(page);
		await popularBuilds.goto("splattershot");

		// admin's identical builds count once, N-ZAP's brings it to 2 players
		await expect(popularBuilds.placement(1)).toBeVisible();
		await expect(popularBuilds.playersCount(2)).toBeVisible();
		await expect(
			popularBuilds.buildAbility({ rank: 1, ability: "CB" }),
		).toHaveCount(1);
		// 19 AP = one main and three subs
		await expect(
			popularBuilds.buildAbility({ rank: 1, ability: "SSU" }),
		).toHaveCount(4);
		await expect(
			popularBuilds.buildAbility({ rank: 1, ability: "RSU" }),
		).toHaveCount(4);
		await expect(
			popularBuilds.buildAbility({ rank: 1, ability: "ISM" }),
		).toHaveCount(3);
		await isNotVisible(popularBuilds.placement(2));
	});

	test("edits build title, changes sorting and deletes a build", async ({
		page,
		factories,
	}) => {
		const olderBuild = await factories.BuildFactory.create({
			ownerId: ADMIN_ID,
			title: "Alpha Build",
		});
		await factories.BuildFactory.create({
			ownerId: ADMIN_ID,
			title: "Mid Build",
		});
		await factories.backdate("Build", olderBuild.id, {
			updatedAt: subDays(new Date(), 1),
		});

		await impersonate(page);

		const userBuilds = new UserBuildsPage(page);
		await userBuilds.goto(ADMIN_ID);

		await expect(userBuilds.buildCard(0).title).toContainText("Mid Build");

		const buildForm = await userBuilds.editBuild(0);
		await buildForm.form.fill("title", "Zulu Build");
		await buildForm.form.submit();

		await expect(userBuilds.buildCard(0).title).toContainText("Zulu Build");
		await expect(userBuilds.buildCard(1).title).toContainText("Alpha Build");

		await userBuilds.changeSortingTo("ALPHABETICAL_TITLE");

		await expect(userBuilds.buildCard(0).title).toContainText("Alpha Build");
		await expect(userBuilds.buildCard(1).title).toContainText("Zulu Build");

		await userBuilds.deleteBuild(0);

		await expect(userBuilds.locators.buildCards).toHaveCount(1);
		await expect(userBuilds.buildCard(0).title).toContainText("Zulu Build");
	});
});
