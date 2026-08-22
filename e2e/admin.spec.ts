import path from "node:path";
import { fileURLToPath } from "node:url";
import { addHours, addYears } from "date-fns";
import { NZAP_TEST_DISCORD_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { SPLATOON_3_XP_BADGE_VALUES } from "~/features/badges/badges-constants";
import {
	expect,
	impersonate,
	isNotVisible,
	navigate,
	test,
} from "./helpers/playwright";
import { AdminActionsPage } from "./pages/admin/admin-actions-page";
import { AdminStreamsPage } from "./pages/admin/admin-streams-page";
import { ApiPage } from "./pages/api/api-page";
import { NewArtPage } from "./pages/art/new-art-page";
import { TopRightButtons } from "./pages/layout/top-right-buttons";
import { NewOrganizationPage } from "./pages/org/new-organization-page";
import { UserPage } from "./pages/user/user-page";
import { NewVodPage } from "./pages/vods/new-vod-page";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_IMAGE_PATH = path.join(__dirname, "fixtures/test-image.png");

const ROLE_TARGET = {
	discordId: "223456789012345678",
	discordName: "RoleTarget",
};
const KEEPER = { discordId: "323456789012345678", discordName: "KeeperUser" };
const LEAVER = { discordId: "423456789012345678", discordName: "LeaverUser" };
const FRIEND_CODE = "0123-4567-8901";
// the wiped database makes the placement's player the first SplatoonPlayer row
const LINKED_PLAYER_ID = 1;

test.describe("Admin panel", () => {
	test("grants roles, friend code and API access to a user", async ({
		page,
		factories,
	}) => {
		const target = await factories.UserFactory.create({
			...ROLE_TARGET,
			friendCode: null,
		});

		const api = new ApiPage(page);

		await impersonate(page, target.id);
		await api.goto();
		await expect(api.locators.noAccessMessage).toBeVisible();

		await impersonate(page, ADMIN_ID);
		const adminActions = new AdminActionsPage(page);
		await adminActions.goto();
		await adminActions.updateFriendCode(ROLE_TARGET.discordName, FRIEND_CODE);
		await adminActions.giveArtist(ROLE_TARGET.discordName);
		await adminActions.giveVideoAdder(ROLE_TARGET.discordName);
		await adminActions.giveApiAccess(ROLE_TARGET.discordName);

		await adminActions.openFriendCodeLookUp();
		await adminActions.searchFriendCode(FRIEND_CODE);
		await expect(
			adminActions.foundUserLink(ROLE_TARGET.discordName),
		).toBeVisible();

		await impersonate(page, target.id);

		const newArt = new NewArtPage(page);
		await newArt.goto();
		await expect(newArt.locators.descriptionInput).toBeVisible();

		const newVod = new NewVodPage(page);
		await newVod.goto();
		await expect(newVod.locators.addMatchButton).toBeVisible();

		await api.goto();
		await isNotVisible(api.locators.noAccessMessage);
		const token = await api.generateToken("read");
		expect(token.length).toBeGreaterThan(0);
	});

	test("grants tournament organizer role and patron status to a user", async ({
		page,
		factories,
	}) => {
		const target = await factories.UserFactory.create(ROLE_TARGET);

		const newOrganization = new NewOrganizationPage(page);
		const topRightButtons = new TopRightButtons(page);

		await impersonate(page, target.id);
		await newOrganization.goto();
		await expect(newOrganization.locators.noPermissionsAlert).toBeVisible();
		await navigate({ page, url: "/" });
		await expect(topRightButtons.locators.supportLink).toBeVisible();

		await impersonate(page, ADMIN_ID);
		const adminActions = new AdminActionsPage(page);
		await adminActions.goto();
		await adminActions.giveTournamentOrganizer(ROLE_TARGET.discordName);
		// tier one so the tournament organizer grant above stays the only source of that role
		await adminActions.forcePatron(ROLE_TARGET.discordName, {
			tier: "Support",
			expiresAt: addYears(new Date(), 1),
		});

		await impersonate(page, target.id);
		await newOrganization.goto();
		await expect(newOrganization.locators.heading).toBeVisible();

		await navigate({ page, url: "/" });
		await isNotVisible(topRightButtons.locators.supportLink);
	});

	test("links a player, refreshes plus tiers and migrates an account", async ({
		page,
		factories,
	}) => {
		// linking a player syncs XP badges, which requires every XP badge to exist
		for (const value of SPLATOON_3_XP_BADGE_VALUES) {
			await factories.BadgeFactory.create({ code: String(value) });
		}
		await factories.XRankPlacementFactory.create({
			playerSplId: "e2e-unlinked-player",
			name: "PlacedPlayer",
		});
		const keeper = await factories.UserFactory.create({ ...KEEPER });
		await factories.UserFactory.create({ ...LEAVER });
		await factories.PlusVoteFactory.create({
			authorId: ADMIN_ID,
			votedId: keeper.id,
		});

		await impersonate(page, ADMIN_ID);
		const adminActions = new AdminActionsPage(page);
		await adminActions.goto();
		await adminActions.linkPlayer("N-ZAP", LINKED_PLAYER_ID);
		await adminActions.refreshPlusTiers();
		await adminActions.migrateUser({
			oldUserName: KEEPER.discordName,
			newUserName: LEAVER.discordName,
		});

		await expect(
			await adminActions.userSearchSuggestion(KEEPER.discordName),
		).toContainText("+1");

		const userPage = new UserPage(page);
		await userPage.goto(NZAP_TEST_DISCORD_ID);
		await expect(userPage.locators.placementsBox).toBeVisible();
		const playerPage = await userPage.openPlacements();
		await expect(playerPage.locators.heading).toBeVisible();

		// the old user kept their account, now reached via the new user's Discord id
		await userPage.goto(LEAVER.discordId);
		await expect(userPage.usernameHeading(KEEPER.discordName)).toBeVisible();
	});

	test("adds and deletes an external stream", async ({ page }) => {
		await impersonate(page, ADMIN_ID);

		const streams = new AdminStreamsPage(page);
		await streams.goto();
		await expect(streams.locators.addStreamHeading).toBeVisible();
		await expect(streams.locators.noStreams).toBeVisible();

		await streams.createStream({
			name: "E2E Stream",
			url: "https://www.twitch.tv/sendou",
			startTime: addHours(new Date(), 1),
			logoPath: TEST_IMAGE_PATH,
		});

		await expect(streams.streamLink("E2E Stream")).toBeVisible();
		await isNotVisible(streams.locators.noStreams);

		await streams.deleteStream("E2E Stream");
		await expect(streams.locators.noStreams).toBeVisible();
	});
});
