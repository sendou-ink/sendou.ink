import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import { SENDOUQ_LOOKING_PAGE, SENDOUQ_PREPARING_PAGE } from "~/utils/urls";
import { expect, impersonate, test } from "./helpers/playwright";
import { SendouQLookingPage } from "./pages/sendouq/sendouq-looking-page";
import { SendouQPage } from "./pages/sendouq/sendouq-page";
import { MatchProfilePage } from "./pages/settings/match-profile-page";

test.describe("SendouQ", () => {
	test("Group preparation flow - add friends and users via invite link", async ({
		page,
		factories,
	}) => {
		const [owner, friend, invited, outsider] =
			await factories.UserFactory.createMany(4);
		await factories.FriendshipFactory.create({
			userOneId: owner.id,
			userTwoId: friend.id,
		});

		await impersonate(page, owner.id);

		const q = new SendouQPage(page);
		await q.goto();

		const preparing = await q.joinWithMates();
		await expect(preparing.groupCard.members).toHaveCount(1);

		// a preparing group is not part of the pool other users are matched from
		await impersonate(page, outsider.id);
		await q.goto();

		const looking = await q.joinSolo();
		await expect(looking.locators.groupCards).toHaveCount(1);

		await impersonate(page, owner.id);
		await preparing.goto();
		await preparing.addFirstFriend();

		await expect(preparing.groupCard.members).toHaveCount(2);

		const inviteCode = await preparing.inviteCode();

		await impersonate(page, invited.id);
		await q.gotoInviteLink(inviteCode);

		await expect(q.locators.joinGroupDialog).toBeVisible();
		await q.joinInvitedGroup();

		await expect(page).toHaveURL(SENDOUQ_PREPARING_PAGE);
		await expect(preparing.groupCard.members).toHaveCount(3);

		await preparing.joinQueue();
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);
	});

	test("Request flow - partial groups morph together", async ({
		page,
		factories,
	}) => {
		const [requester, accepter] = await factories.UserFactory.createMany(2);
		await factories.SQGroupFactory.create({ memberUserIds: [requester.id] });
		await factories.SQGroupFactory.create({ memberUserIds: [accepter.id] });

		await impersonate(page, requester.id);

		const looking = new SendouQLookingPage(page);
		await looking.goto();
		await looking.pressGroupAction();

		await impersonate(page, accepter.id);
		await looking.goto();

		await expect(looking.groupCard(1).root).toBeVisible();
		await looking.pressGroupAction();

		// the morphed group keeps looking, it is not matched up yet
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);
		await expect(looking.ownGroupCard.members).toHaveCount(2);
	});

	test("Changing match preferences cancels pending requests", async ({
		page,
		factories,
	}) => {
		const ownGroup = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		const otherGroup = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		await factories.SQGroupFactory.create({
			memberUserIds: ownGroup.map((member) => member.id),
		});
		await factories.SQGroupFactory.create({
			memberUserIds: otherGroup.map((member) => member.id),
		});

		// challenge the other full group as the owner of our own full group
		await impersonate(page, ownGroup[0].id);

		const looking = new SendouQLookingPage(page);
		await looking.goto();
		await looking.pressGroupAction();

		// the challenge is now pending and can be undone
		await expect(looking.locators.undoButtons).toHaveCount(1);

		// Changing a matchmaking preference (noScreen) last second must undo the
		// pending request so it can't be matched on terms the challenger never saw
		const matchProfile = new MatchProfilePage(page);
		await matchProfile.goto();
		await matchProfile.form.check("noScreen");
		await matchProfile.save();

		// the pending challenge has been undone
		await looking.goto();
		await expect(looking.locators.undoButtons).toHaveCount(0);
	});
});
