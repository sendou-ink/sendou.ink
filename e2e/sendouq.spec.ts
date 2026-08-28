import { sub } from "date-fns";
import { SENDOUQ_MAP_POOL } from "~/features/match-profile/banned-maps";
import { AMOUNT_OF_MAPS_IN_POOL_PER_MODE } from "~/features/match-profile/match-profile-constants";
import {
	FULL_GROUP_SIZE,
	SENDOUQ,
	SENDOUQ_BEST_OF,
} from "~/features/sendouq/q-constants";
import {
	SENDOUQ_LOOKING_PAGE,
	SENDOUQ_PAGE,
	SENDOUQ_PREPARING_PAGE,
	SENDOUQ_READY_PAGE,
} from "~/utils/urls";
import {
	endSeason,
	expect,
	impersonate,
	isNotVisible,
	runRoutine,
	test,
} from "./helpers/playwright";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { SendouQLookingPage } from "./pages/sendouq/sendouq-looking-page";
import { SendouQMatchPage } from "./pages/sendouq/sendouq-match-page";
import { SendouQPage } from "./pages/sendouq/sendouq-page";
import { SendouQReadyPage } from "./pages/sendouq/sendouq-ready-page";
import { MatchProfilePage } from "./pages/settings/match-profile-page";

const TEAM_MODE = "TC" as const;
const TEAM_MAP_POOL = SENDOUQ_MAP_POOL.parsed[TEAM_MODE]
	.slice(0, AMOUNT_OF_MAPS_IN_POOL_PER_MODE)
	.map((stageId) => ({ mode: TEAM_MODE, stageId }));

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

	test("Suggesting floats a group to the top and leaves a trail for the group", async ({
		page,
		factories,
	}) => {
		const owner = await factories.UserFactory.create({
			discordName: "Owner",
			profile: null,
		});
		const teammate = await factories.UserFactory.create({
			discordName: "Teammate",
			profile: null,
		});
		const target = await factories.UserFactory.create({
			discordName: "Target",
			profile: null,
		});
		const other = await factories.UserFactory.create({
			discordName: "Other",
			profile: null,
		});

		await factories.SQGroupFactory.create({
			memberUserIds: [owner.id, teammate.id],
		});
		const suggestedGroup = await factories.SQGroupFactory.create({
			memberUserIds: [target.id],
		});
		await factories.SQGroupFactory.create({ memberUserIds: [other.id] });

		// the least recently active group sorts last, so the suggestion has somewhere to move it from
		await factories.backdate("Group", suggestedGroup.id, {
			latestActionAt: sub(new Date(), { minutes: 10 }),
		});

		await impersonate(page, owner.id);

		const looking = new SendouQLookingPage(page);
		await looking.goto();

		// the own group's card is always the first one
		await expect(looking.groupCard(2).root).toContainText("Target");

		await looking.groupCard(2).pressSuggest();

		await expect(looking.groupCard(1).root).toContainText("Target");
		await expect(looking.groupCard(1).trail).toHaveText("Suggested by Owner");
		// a suggestion can't be undone or repeated
		await isNotVisible(looking.groupCard(1).suggestButton);

		// the whole group sees the suggestion, and any of them can act on it
		await impersonate(page, teammate.id);
		await looking.goto();
		await expect(looking.groupCard(1).trail).toHaveText("Suggested by Owner");

		await looking.groupCard(1).pressAction();

		// inviting says everything the suggestion said, so it takes the trail over
		await expect(looking.groupCard(1).trail).toHaveText("Invited by Teammate");
		await isNotVisible(looking.groupCard(1).suggestButton);

		// a solo queuer has no teammates to suggest anything to
		await impersonate(page, other.id);
		await looking.goto();
		await isNotVisible(looking.locators.suggestButtons);
	});

	test.describe("On a phone sized screen", () => {
		test.use({ viewport: { width: 390, height: 844 } });

		test("Suggesting floats the group without dragging the viewer's scroll position along", async ({
			page,
			factories,
		}) => {
			const [owner, teammate] = await factories.UserFactory.createMany(2);
			await factories.SQGroupFactory.create({
				memberUserIds: [owner.id, teammate.id],
			});

			const otherUsers = await factories.UserFactory.createMany(12);
			for (const [index, user] of otherUsers.entries()) {
				const group = await factories.SQGroupFactory.create({
					memberUserIds: [user.id],
				});
				// the least recently active group sorts last, giving the suggestion
				// the whole page to move the card up
				await factories.backdate("Group", group.id, {
					latestActionAt: sub(new Date(), { minutes: index }),
				});
			}

			await impersonate(page, owner.id);

			const looking = new SendouQLookingPage(page);
			await looking.goto();

			const lastCard = looking.groupCard(otherUsers.length - 1);
			await lastCard.root.scrollIntoViewIfNeeded();
			const scrollBefore = await page.evaluate(() => window.scrollY);
			expect(scrollBefore).toBeGreaterThan(0);

			await lastCard.pressSuggest();

			await expect(looking.groupCard(0).trail).toBeVisible();
			expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
		});
	});

	test("Previewing the queue shows the groups without any way to act on them", async ({
		page,
		factories,
	}) => {
		const supporter = await factories.UserFactory.create(null, {
			patronTier: 2,
		});
		const [soloQueuer] = await factories.UserFactory.createMany(1);
		const fullGroupMembers =
			await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		await factories.SQGroupFactory.create({ memberUserIds: [soloQueuer.id] });
		await factories.SQGroupFactory.create({
			memberUserIds: fullGroupMembers.map((member) => member.id),
		});

		await impersonate(page, supporter.id);

		const looking = new SendouQLookingPage(page);
		await looking.gotoPreview();

		await expect(looking.locators.groupCards).toHaveCount(2);
		// without a group of their own there is nothing to invite, challenge or suggest with
		await isNotVisible(looking.locators.actionButtons);
		await isNotVisible(looking.locators.suggestButtons);
	});

	test("Previewing the queue is only for supporters", async ({
		page,
		factories,
	}) => {
		const [user] = await factories.UserFactory.createMany(1);

		await impersonate(page, user.id);

		const looking = new SendouQLookingPage(page);
		await looking.gotoPreview();

		await expect(page).toHaveURL(SENDOUQ_PAGE);
	});

	test("A team's map preferences decide its modes and the maps it is given", async ({
		page,
		factories,
	}) => {
		const members = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		// the opponents want the same mode as the team, so an overlap of exactly it
		// can only come from the team's own preferences: its members have none
		const opponents = await factories.UserFactory.createMany(
			FULL_GROUP_SIZE,
			null,
			{
				matchProfile: {
					mapModePreferences: {
						modes: [{ mode: TEAM_MODE, preference: "PREFER" }],
						pool: [],
					},
				},
			},
		);

		await factories.TeamFactory.create(
			{ memberUserIds: members.map((member) => member.id) },
			{
				mapModePreferences: {
					modes: [{ mode: TEAM_MODE, preference: "PREFER" }],
					pool: [
						{
							mode: TEAM_MODE,
							stages: TEAM_MAP_POOL.map((map) => map.stageId),
						},
					],
				},
			},
		);

		const teamGroup = await factories.SQGroupFactory.create({
			memberUserIds: members.map((member) => member.id),
		});
		const opponentGroup = await factories.SQGroupFactory.create({
			memberUserIds: opponents.map((member) => member.id),
		});

		await impersonate(page, opponents[0].id);

		const looking = new SendouQLookingPage(page);
		await looking.goto();

		// the modes the match would be played on are the team's, not its members'
		await expect(looking.groupCard(1).modes).toHaveCount(1);
		await expect(looking.groupCard(1).mode(TEAM_MODE)).toBeVisible();

		await factories.SQReadyCheckFactory.create(
			{
				alphaGroupId: teamGroup.id,
				bravoGroupId: opponentGroup.id,
				confirmedByUserId: members[0].id,
			},
			{
				confirmedByUserIds: [
					...members.slice(1).map((member) => member.id),
					...opponents.slice(0, -1).map((member) => member.id),
				],
			},
		);

		// the last confirmation is what makes the match, and with it its map list
		await impersonate(page, opponents.at(-1)!.id);

		const ready = new SendouQReadyPage(page);
		await ready.goto();
		await ready.confirmReady();

		await expect(page).toHaveURL(/\/q\/match\/\d+/);

		const match = new SendouQMatchPage(page);
		await expect(match.modeProgress(TEAM_MODE)).toBeVisible();
		await expect(match.mapCountText(SENDOUQ_BEST_OF)).toBeVisible();
		await expect(match.currentMap(TEAM_MAP_POOL)).toBeVisible();
	});

	test("Ready check flow - both groups confirm and the match starts", async ({
		page,
		factories,
	}) => {
		// every one of the eight members logs in and confirms on their own
		test.slow();

		const challengers = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		const accepters = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		const challengerGroup = await factories.SQGroupFactory.create({
			memberUserIds: challengers.map((member) => member.id),
		});
		await factories.SQGroupFactory.create(
			{ memberUserIds: accepters.map((member) => member.id) },
			{ likedByGroupIds: [challengerGroup.id] },
		);

		await impersonate(page, accepters[0].id);

		const looking = new SendouQLookingPage(page);
		await looking.goto();
		await looking.pressGroupAction();

		// accepting the challenge starts the ready check instead of the match
		await expect(page).toHaveURL(SENDOUQ_READY_PAGE);

		const ready = new SendouQReadyPage(page);
		await expect(ready.locators.countdown).toBeVisible();
		// who they will be playing is not revealed yet
		await expect(ready.locators.hiddenGroupCard).toBeVisible();
		// accepting counted as being ready, so it is 1 of the 8
		await expect(ready.locators.membersReady).toHaveCount(1);
		await expect(ready.locators.confirmedText).toBeVisible();

		const notifications = new NotificationPopover(page);

		const restOfTheQueue = [...accepters.slice(1), ...challengers];
		for (const member of restOfTheQueue.slice(0, -1)) {
			await impersonate(page, member.id);
			await ready.goto();

			// the ready check notification stays unseen until they respond to it
			await expect(notifications.locators.bellDot).toBeVisible();

			await ready.confirmReady();

			await expect(page).toHaveURL(SENDOUQ_READY_PAGE);
			await expect(ready.locators.confirmedText).toBeVisible();
			await expect(notifications.locators.bellDot).toBeHidden();
		}

		// the last one to confirm gets everyone into the match
		await impersonate(page, restOfTheQueue.at(-1)!.id);
		await ready.goto();

		await expect(notifications.locators.bellDot).toBeVisible();

		await ready.confirmReady();

		await expect(page).toHaveURL(/\/q\/match\/\d+/);

		// confirming resolved the ready check notification and the new match
		// notification arrives already seen for the one who created the match
		await expect(notifications.locators.bellDot).toBeHidden();
	});

	test("Ready check expiring sends the groups back to looking and lets them kick who missed it", async ({
		page,
		factories,
	}) => {
		const ownMembers = await factories.UserFactory.createMany(FULL_GROUP_SIZE, {
			profile: null,
		});
		const theirMembers = await factories.UserFactory.createMany(
			FULL_GROUP_SIZE,
			{ profile: null },
		);
		const ownGroup = await factories.SQGroupFactory.create({
			memberUserIds: ownMembers.map((member) => member.id),
		});
		const theirGroup = await factories.SQGroupFactory.create({
			memberUserIds: theirMembers.map((member) => member.id),
		});

		// everyone but the last member of the own group confirms
		const readyCheck = await factories.SQReadyCheckFactory.create(
			{
				alphaGroupId: ownGroup.id,
				bravoGroupId: theirGroup.id,
				confirmedByUserId: ownMembers[0].id,
			},
			{
				confirmedByUserIds: [
					...ownMembers.slice(1, -1).map((member) => member.id),
					...theirMembers.map((member) => member.id),
				],
			},
		);
		await factories.backdate("GroupReadyCheck", readyCheck.id, {
			createdAt: sub(new Date(), { minutes: SENDOUQ.READY_CHECK_MINUTES + 1 }),
		});

		await runRoutine(page, "ExpireReadyChecks");

		await impersonate(page, ownMembers[0].id);

		const looking = new SendouQLookingPage(page);
		await looking.goto();

		// the group is looking again and the one who never confirmed can be kicked
		await expect(looking.ownGroupCard.members).toHaveCount(FULL_GROUP_SIZE);
		await expect(looking.ownGroupCard.kickButtons).toHaveCount(1);

		await looking.ownGroupCard.pressKick();

		await expect(looking.ownGroupCard.members).toHaveCount(FULL_GROUP_SIZE - 1);
		await expect(looking.ownGroupCard.kickButtons).toHaveCount(0);
	});

	test("A ready check outliving the season doesn't turn into a match", async ({
		page,
		factories,
	}) => {
		const ownMembers = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		const theirMembers =
			await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		const ownGroup = await factories.SQGroupFactory.create({
			memberUserIds: ownMembers.map((member) => member.id),
		});
		const theirGroup = await factories.SQGroupFactory.create({
			memberUserIds: theirMembers.map((member) => member.id),
		});

		// everyone but the last member of the own group confirmed
		await factories.SQReadyCheckFactory.create(
			{
				alphaGroupId: ownGroup.id,
				bravoGroupId: theirGroup.id,
				confirmedByUserId: ownMembers[0].id,
			},
			{
				confirmedByUserIds: [
					...ownMembers.slice(1, -1).map((member) => member.id),
					...theirMembers.map((member) => member.id),
				],
			},
		);

		await impersonate(page, ownMembers.at(-1)!.id);

		const ready = new SendouQReadyPage(page);
		await ready.goto();

		// the season ends before the last one confirms
		await endSeason(page);

		await ready.confirmReady();

		// there is no rated match left to make, so the ready check ends and both
		// groups leave the queue instead of being sent to play
		await expect(page).toHaveURL(SENDOUQ_PAGE);
	});

	test("The season ending takes the groups out of the queue", async ({
		page,
		factories,
	}) => {
		const members = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
		await factories.SQGroupFactory.create({
			memberUserIds: members.map((member) => member.id),
		});

		await impersonate(page, members[0].id);

		const looking = new SendouQLookingPage(page);
		await looking.goto();
		await expect(looking.ownGroupCard.members).toHaveCount(FULL_GROUP_SIZE);

		await endSeason(page);

		// the group is taken out of the queue on the spot, so there is no
		// looking page left to be on
		await looking.goto();
		await expect(page).toHaveURL(SENDOUQ_PAGE);

		// and no way back in until the next season starts
		const q = new SendouQPage(page);
		await isNotVisible(q.locators.joinWithMatesButton);
	});

	test("Joining the queue is blocked when the season's initial powers were never seeded", async ({
		page,
		factories,
	}) => {
		const [user] = await factories.UserFactory.createMany(1);
		// the previous season concluded with skills but the current one has none,
		// meaning season-initial-powers was forgotten
		await factories.SkillFactory.create({ userId: user.id, season: 0 });

		await impersonate(page, user.id);

		const q = new SendouQPage(page);
		await q.goto();
		await q.joinSolo();

		await expect(
			page.getByText("Season's starting powers are not set yet"),
		).toBeAttached();
		await expect(page).toHaveURL(SENDOUQ_PAGE);
	});
});
