import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { SENDOUQ_LOOKING_PAGE } from "~/utils/urls";
import { expect, impersonate, test } from "./helpers/playwright";
import { FriendsPage } from "./pages/friends/friends-page";
import { LFGPage } from "./pages/lfg/lfg-page";
import { SendouQLookingPage } from "./pages/sendouq/sendouq-looking-page";

test.describe("User card", () => {
	test("edits banner and bio from the looking page", async ({
		page,
		factories,
	}) => {
		await factories.SQGroupFactory.create({ memberUserIds: [ADMIN_ID] });

		await impersonate(page);

		const looking = new SendouQLookingPage(page);
		await looking.goto();

		const card = await looking.ownGroupCard.openMemberCard("Sendou");
		const cardEdit = await card.openEditPage();
		await expect(page).toHaveURL(/\/user-card\/edit/);

		const newBio = "New bio from e2e test";
		await cardEdit.form.fill("shortBio", newBio);
		await cardEdit.form.select("bannerType", "COLOR");
		await cardEdit.selectBannerColor("#4169e1");

		await cardEdit.save();
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);

		await looking.ownGroupCard.openMemberCard("Sendou");
		await expect(card.bio(newBio)).toBeVisible();
		await expect(card.locators.banner).toHaveCSS(
			"background-color",
			"rgb(65, 105, 225)",
		);
	});

	test("shows the verified peak XP of the selected division", async ({
		page,
		factories,
	}) => {
		await factories.SQGroupFactory.create({ memberUserIds: [ADMIN_ID] });
		await factories.XRankPlacementFactory.create({
			playerUserId: ADMIN_ID,
			power: 3010,
			region: "WEST",
		});
		await factories.XRankPlacementFactory.create(
			{ playerUserId: ADMIN_ID, power: 3000, region: "JPN" },
			{ refreshPeakXp: true },
		);

		await impersonate(page);

		const looking = new SendouQLookingPage(page);
		await looking.goto();

		const card = await looking.ownGroupCard.openMemberCard("Sendou");
		await expect(card.xp(3010)).toBeVisible();

		const cardEdit = await card.openEditPage();
		await cardEdit.form.select("xpDivision", "JPN");
		await cardEdit.save();
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);

		await looking.ownGroupCard.openMemberCard("Sendou");
		await expect(card.xp(3000)).toBeVisible();
		await expect(card.xp(3010)).not.toBeVisible();
	});
});

test.describe("User card friend request", () => {
	test("receiver sees add friend button that accepts the incoming request", async ({
		page,
		factories,
	}) => {
		await factories.LFGPostFactory.create({ authorId: NZAP_TEST_ID });

		await impersonate(page, NZAP_TEST_ID);

		const friends = new FriendsPage(page);
		await friends.goto();
		await friends.sendRequest("Sendou");
		await expect(friends.locators.cancelRequestButton).toBeVisible();

		await impersonate(page);

		const lfg = new LFGPage(page);
		await lfg.goto();
		const card = await lfg.openUserCard("N-ZAP");

		await expect(card.locators.acceptFriendRequestButton).toBeVisible();
		await expect(card.locators.pendingFriendRequestButton).not.toBeVisible();

		await card.acceptFriendRequest();

		await expect(card.locators.friendRequestAcceptedToast).toBeAttached();
		await expect(card.locators.acceptFriendRequestButton).not.toBeVisible();
		await expect(card.locators.sendFriendRequestButton).not.toBeVisible();

		await friends.goto();
		await expect(friends.friendButton("N-ZAP").first()).toBeVisible();
	});

	test("sender still sees pending state on the receiver's card", async ({
		page,
		factories,
	}) => {
		await factories.LFGPostFactory.create({ authorId: NZAP_TEST_ID });

		await impersonate(page);

		const friends = new FriendsPage(page);
		await friends.goto();
		await friends.sendRequest("N-ZAP");
		await expect(friends.locators.cancelRequestButton).toBeVisible();

		const lfg = new LFGPage(page);
		await lfg.goto();
		const card = await lfg.openUserCard("N-ZAP");

		await expect(card.locators.pendingFriendRequestButton).toBeVisible();
		await expect(card.locators.pendingFriendRequestButton).toBeDisabled();
		await expect(card.locators.acceptFriendRequestButton).not.toBeVisible();
	});
});
