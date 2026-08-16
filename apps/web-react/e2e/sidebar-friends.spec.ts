import { NZAP_TEST_ID } from "~/db/seed/constants";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import {
	EVENTS_PAGE,
	FRIENDS_PAGE,
	SENDOUQ_LOOKING_PAGE,
	sendouQMatchPage,
	tournamentMatchPage,
	tournamentSubsPage,
	twitchUrl,
} from "~/utils/urls";
import {
	expect,
	expectNoErrorPage,
	impersonate,
	MOBILE_VIEWPORT,
	TABLET_VIEWPORT,
	test,
	waitForPOSTResponse,
} from "./helpers/playwright";
import {
	befriend,
	createNamedUsers,
	createUserIds,
	inHours,
	LOGGED_OUT_FRIENDS_TEXT,
	NO_FRIENDS_TEXT,
	streamAccountOf,
} from "./helpers/sidebar";
import {
	createInProgressMatch,
	createSubSeekingTournament,
	createTournamentWithByeTeam,
} from "./helpers/tournament";
import { FriendsPage } from "./pages/friends/friends-page";
import { FrontPage } from "./pages/front-page/front-page";
import { MobileNav } from "./pages/layout/mobile-nav";
import { SideNav } from "./pages/layout/side-nav";

const CAST_ACCOUNT = "cast_account";

test.describe("Sidebar friends", () => {
	test("shows what each friend is doing right now", async ({
		page,
		factories,
	}) => {
		const [idle, queueing, sub, inMatch, groupMate] = await createNamedUsers(
			factories,
			["IdleFriend", "QueueFriend", "SubFriend", "MatchFriend", "GroupMate"],
		);
		await befriend(factories, [idle.id, queueing.id, sub.id, inMatch.id]);

		await factories.SQGroupFactory.create({
			memberUserIds: [queueing.id, groupMate.id],
		});

		await createSubSeekingTournament(factories, {
			name: "Sub Tournament",
			subId: sub.id,
		});

		await createInProgressMatch(factories, {
			name: "Match Tournament",
			friendId: inMatch.id,
		});

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);

		const idleRow = sideNav.friend("IdleFriend");
		await expect(idleRow.trigger).toBeVisible();
		await expect(idleRow.locators.subtitle).toHaveCount(0);
		await expect(idleRow.locators.badge).toHaveCount(0);

		const queueingRow = sideNav.friend("QueueFriend");
		await expect(queueingRow.locators.subtitle).toHaveText("SendouQ");
		await expect(queueingRow.locators.badge).toHaveText("2/4");

		const subRow = sideNav.friend("SubFriend");
		await expect(subRow.locators.subtitle).toHaveText("Sub Tournament");
		await expect(subRow.locators.badge).toHaveText("1/4");

		const inMatchRow = sideNav.friend("MatchFriend");
		await expect(inMatchRow.locators.subtitle).toHaveText("Match Tournament");
		await expect(inMatchRow.locators.badge).toHaveText("Match");
	});

	test("friend menu actions of SendouQ friends land on a real page", async ({
		page,
		factories,
	}) => {
		const [me, idle, queueing, inSendouQMatch] = await createNamedUsers(
			factories,
			["SidebarUser", "IdleFriend", "QueueFriend", "MatchFriend"],
		);
		await befriend(factories, [idle.id, queueing.id, inSendouQMatch.id], me.id);

		await factories.SQGroupFactory.create({ memberUserIds: [queueing.id] });

		const match = await factories.SQMatchFactory.create({
			alphaUserIds: [inSendouQMatch.id, ...(await createUserIds(factories, 3))],
			bravoUserIds: await createUserIds(factories, 4),
		});

		await impersonate(page, me.id);
		const front = new FrontPage(page);
		await front.goto();

		const sideNav = new SideNav(page);

		const idleRow = sideNav.friend("IdleFriend");
		await idleRow.openMenu();
		await expect(idleRow.menuItem("Delete friend")).toHaveCount(0);
		await idleRow.menuItem("View user page").click();
		await expect(page).toHaveURL(/\/u\//);
		await expectNoErrorPage(page);

		await front.goto();
		const matchRow = sideNav.friend("MatchFriend");
		await matchRow.openMenu();
		await matchRow.menuItem("View match").click();
		await expect(page).toHaveURL(sendouQMatchPage(match.id));
		await expectNoErrorPage(page);

		await front.goto();
		const queueingRow = sideNav.friend("QueueFriend");
		await queueingRow.openMenu();
		await waitForPOSTResponse(page, () =>
			queueingRow.menuItem("Join SendouQ").click(),
		);
		await expect(page).toHaveURL(SENDOUQ_LOOKING_PAGE);
		await expectNoErrorPage(page);
	});

	test("friend menu actions of tournament friends land on a real page", async ({
		page,
		factories,
	}) => {
		const [sub, inMatch, waiting] = await createNamedUsers(factories, [
			"SubFriend",
			"MatchFriend",
			"WaitingFriend",
		]);
		await befriend(factories, [sub.id, inMatch.id, waiting.id]);

		const { tournament: subTournament } = await createSubSeekingTournament(
			factories,
			{ name: "Sub Tournament", subId: sub.id },
		);

		const { tournament, matchId } = await createInProgressMatch(factories, {
			name: "Match Tournament",
			friendId: inMatch.id,
		});
		const { tournament: waitingTournament } = await createTournamentWithByeTeam(
			factories,
			{ name: "Waiting Tournament", waitingUserId: waiting.id },
		);

		await impersonate(page, NZAP_TEST_ID);
		const front = new FrontPage(page);
		await front.goto();

		const sideNav = new SideNav(page);

		const subRow = sideNav.friend("SubFriend");
		await subRow.openMenu();
		await subRow.menuItem("View tournament").click();
		await expect(page).toHaveURL(tournamentSubsPage(subTournament.id));
		await expectNoErrorPage(page);

		await front.goto();
		const waitingRow = sideNav.friend("WaitingFriend");
		await expect(waitingRow.locators.badge).toHaveText("Next");
		await waitingRow.openMenu();
		await waitingRow.menuItem("View tournament").click();
		await expect(page).toHaveURL(
			new RegExp(`/to/${waitingTournament.id}(/|$)`),
		);
		await expectNoErrorPage(page);

		await front.goto();
		const inMatchRow = sideNav.friend("MatchFriend");
		await inMatchRow.openMenu();
		await inMatchRow.menuItem("View match").click();
		await expect(page).toHaveURL(
			tournamentMatchPage({ tournamentId: tournament.id, matchId }),
		);
		await expectNoErrorPage(page);
	});

	test("shows four friends on desktop, eight in the mobile panel", async ({
		page,
		factories,
	}) => {
		const names = Array.from(
			{ length: 10 },
			(_, index) => `Friend${String(index + 1).padStart(2, "0")}`,
		);
		const friends = await createNamedUsers(factories, names);
		await befriend(
			factories,
			friends.map((friend) => friend.id),
		);

		await impersonate(page, NZAP_TEST_ID);
		const front = new FrontPage(page);
		await front.goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.locators.friendItems).toHaveCount(4);

		await page.setViewportSize(MOBILE_VIEWPORT);
		await front.goto();

		const mobileNav = new MobileNav(page);
		await mobileNav.openPanel("friends");
		await expect(mobileNav.locators.friendItems).toHaveCount(8);

		await mobileNav.locators.viewAllLink.click();
		await expect(page).toHaveURL(FRIENDS_PAGE);

		const friendsPage = new FriendsPage(page);
		for (const name of names) {
			await expect(friendsPage.friendButton(name)).toBeVisible();
		}
	});

	test("unseen friend requests show as a badge", async ({
		page,
		factories,
	}) => {
		const requesters = await factories.UserFactory.createMany(2);
		for (const requester of requesters) {
			await factories.FriendRequestFactory.create({
				senderId: requester.id,
				receiverId: NZAP_TEST_ID,
			});
		}

		await impersonate(page, NZAP_TEST_ID);
		const front = new FrontPage(page);
		await front.goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.locators.unseenRequestsBadge).toHaveText("2");

		await sideNav.toggleCollapse();
		await expect(sideNav.collapsedRequestsBadge).toHaveText("2");

		const friendsPage = new FriendsPage(page);
		await friendsPage.goto();
		await friendsPage.acceptRequest();

		await front.goto();
		await expect(sideNav.locators.unseenRequestsBadge).toHaveCount(0);
	});

	test("shows an empty state for both logged out and friendless users", async ({
		page,
	}) => {
		const front = new FrontPage(page);
		await front.goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.emptyText(LOGGED_OUT_FRIENDS_TEXT)).toBeVisible();
		await expect(sideNav.viewAllLink("Friends")).toHaveCount(0);

		await impersonate(page, NZAP_TEST_ID);
		await front.goto();

		await expect(sideNav.emptyText(NO_FRIENDS_TEXT)).toBeVisible();
		await expect(sideNav.viewAllLink("Friends")).toBeVisible();
	});
});

test.describe("Sidebar friend streams", () => {
	test("picks the best available stream for a friend's tournament match", async ({
		page,
		factories,
	}) => {
		const [friend, teammate, opponent] = await createNamedUsers(factories, [
			"StreamFriend",
			"StreamTeammate",
			"StreamOpponent",
		]);
		await befriend(factories, [friend.id]);

		const { tournament, matchId } = await createInProgressMatch(factories, {
			name: "Match Tournament",
			friendId: friend.id,
			teammateId: teammate.id,
			opponentId: opponent.id,
		});
		await factories.TournamentFactory.castMatch({
			tournamentId: tournament.id,
			matchId,
			twitchAccount: CAST_ACCOUNT,
		});

		await impersonate(page, NZAP_TEST_ID);
		const front = new FrontPage(page);
		const friendRow = new SideNav(page).friend("StreamFriend");

		const expectWatchStream = async (account: string) => {
			await front.goto();
			await expect(friendRow.locators.badge).toHaveText("Live");
			await friendRow.openMenu();
			expect(await friendRow.watchStreamHref()).toBe(twitchUrl(account));
		};

		await factories.LiveStreamFactory.replaceAll([{ userId: friend.id }]);
		await expectWatchStream(streamAccountOf(friend.id));

		await factories.LiveStreamFactory.replaceAll([{ userId: teammate.id }]);
		await expectWatchStream(streamAccountOf(teammate.id));

		await factories.LiveStreamFactory.replaceAll([
			{ userId: null, twitch: CAST_ACCOUNT },
		]);
		await expectWatchStream(CAST_ACCOUNT);

		await factories.LiveStreamFactory.replaceAll([{ userId: opponent.id }]);
		await expectWatchStream(streamAccountOf(opponent.id));

		await factories.LiveStreamFactory.replaceAll([
			{ userId: friend.id },
			{ userId: teammate.id },
			{ userId: opponent.id },
			{ userId: null, twitch: CAST_ACCOUNT },
		]);
		await expectWatchStream(streamAccountOf(friend.id));
	});

	test("watch stream opens Twitch, not an in-app error page", async ({
		page,
		factories,
	}) => {
		const [friend] = await createNamedUsers(factories, ["StreamFriend"]);
		await befriend(factories, [friend.id]);

		await createInProgressMatch(factories, {
			name: "Match Tournament",
			friendId: friend.id,
		});
		await factories.LiveStreamFactory.replaceAll([{ userId: friend.id }]);

		// stubbed rather than aborted so the popup keeps the URL it was opened with
		await page.context().route("https://twitch.tv/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "text/html",
				body: "<html lang='en'><head><title>Twitch</title></head><body></body></html>",
			}),
		);

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const friendRow = new SideNav(page).friend("StreamFriend");
		await friendRow.openMenu();

		const watchStream = friendRow.menuItem("Watch stream");
		await expect(watchStream).toHaveAttribute(
			"href",
			twitchUrl(streamAccountOf(friend.id)),
		);
		await expect(watchStream).toHaveAttribute("target", "_blank");
		await expect(watchStream).toHaveAttribute("rel", "noreferrer");

		const popupPromise = page
			.context()
			.waitForEvent("page", { timeout: 5_000 })
			.catch(() => null);
		await watchStream.click();
		const popup = await popupPromise;

		if (popup) {
			expect(popup.url()).toContain("twitch.tv");
			await popup.close();
		}

		await expect(page).toHaveURL("/");
		await expectNoErrorPage(page);
	});

	test("shows no stream when nobody streams the friend's match", async ({
		page,
		factories,
	}) => {
		// the friend has a Twitch account on their profile throughout: only an
		// actually live stream may turn the row live
		const [friend, outsider] = await createNamedUsers(
			factories,
			["StreamFriend", "Outsider"],
			{ twitch: "friend_twitch" },
		);
		await befriend(factories, [friend.id]);

		const { tournament, matchId } = await createInProgressMatch(factories, {
			name: "Match Tournament",
			friendId: friend.id,
		});

		await impersonate(page, NZAP_TEST_ID);
		const front = new FrontPage(page);
		await front.goto();

		const friendRow = new SideNav(page).friend("StreamFriend");
		await expect(friendRow.locators.badge).toHaveText("Match");
		await friendRow.openMenu();
		await expect(friendRow.menuItem("View user page")).toBeVisible();
		await expect(friendRow.menuItem("View match")).toHaveAttribute(
			"href",
			tournamentMatchPage({ tournamentId: tournament.id, matchId }),
		);
		await expect(friendRow.menuItem("Watch stream")).toHaveCount(0);

		await factories.LiveStreamFactory.replaceAll([{ userId: outsider.id }]);
		await front.goto();

		await expect(friendRow.locators.badge).toHaveText("Match");
		await friendRow.openMenu();
		await expect(friendRow.menuItem("Watch stream")).toHaveCount(0);
	});

	test("a casted match whose caster is offline is not live", async ({
		page,
		factories,
	}) => {
		const [friend] = await createNamedUsers(factories, ["StreamFriend"]);
		await befriend(factories, [friend.id]);

		const { tournament, matchId } = await createInProgressMatch(factories, {
			name: "Match Tournament",
			friendId: friend.id,
		});
		await factories.TournamentFactory.castMatch({
			tournamentId: tournament.id,
			matchId,
			twitchAccount: CAST_ACCOUNT,
		});

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const friendRow = new SideNav(page).friend("StreamFriend");
		await expect(friendRow.locators.badge).toHaveText("Match");
		await friendRow.openMenu();
		await expect(friendRow.menuItem("Watch stream")).toHaveCount(0);
	});

	test("a friend waiting for their next match is never live", async ({
		page,
		factories,
	}) => {
		const [friend] = await createNamedUsers(factories, ["WaitingFriend"]);
		await befriend(factories, [friend.id]);

		await createTournamentWithByeTeam(factories, {
			name: "Waiting Tournament",
			waitingUserId: friend.id,
		});
		await factories.LiveStreamFactory.replaceAll([{ userId: friend.id }]);

		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const friendRow = new SideNav(page).friend("WaitingFriend");
		await expect(friendRow.locators.badge).toHaveText("Next");
		await friendRow.openMenu();
		await expect(friendRow.menuItem("View tournament")).toBeVisible();
		await expect(friendRow.menuItem("Watch stream")).toHaveCount(0);
	});

	test("shows the stream of a friend's SendouQ match", async ({
		page,
		factories,
	}) => {
		const [friend, streamer] = await createNamedUsers(factories, [
			"MatchFriend",
			"MatchStreamer",
		]);
		await befriend(factories, [friend.id]);

		const match = await factories.SQMatchFactory.create({
			alphaUserIds: [
				friend.id,
				streamer.id,
				...(await createUserIds(factories, 2)),
			],
			bravoUserIds: await createUserIds(factories, 4),
		});
		await factories.LiveStreamFactory.replaceAll([{ userId: streamer.id }]);

		await impersonate(page, NZAP_TEST_ID);
		const front = new FrontPage(page);
		await front.goto();

		const friendRow = new SideNav(page).friend("MatchFriend");
		await expect(friendRow.locators.badge).toHaveText("Live");
		await friendRow.openMenu();
		expect(await friendRow.watchStreamHref()).toBe(
			twitchUrl(streamAccountOf(streamer.id)),
		);

		await factories.LiveStreamFactory.replaceAll([]);
		await front.goto();

		await expect(friendRow.locators.badge).toHaveText("Match");
		await friendRow.openMenu();
		await expect(friendRow.menuItem("Watch stream")).toHaveCount(0);
		await friendRow.menuItem("View match").click();

		await expect(page).toHaveURL(sendouQMatchPage(match.id));
		await expectNoErrorPage(page);
	});
});

test.describe("Sidebar form factors", () => {
	test("collapsing the sidebar sticks across reloads", async ({ page }) => {
		await impersonate(page, NZAP_TEST_ID);
		const front = new FrontPage(page);
		await front.goto();

		const sideNav = new SideNav(page);
		await sideNav.toggleCollapse();
		await expect(sideNav.sectionHeading("Events")).toHaveCount(0);

		await front.goto();
		await expect(sideNav.sectionHeading("Events")).toHaveCount(0);

		await sideNav.toggleCollapse();
		await expect(sideNav.sectionHeading("Events")).toBeVisible();

		await front.goto();
		await expect(sideNav.sectionHeading("Events")).toBeVisible();
	});

	test("tablet shows the same sidebar in a modal", async ({
		page,
		factories,
	}) => {
		const [friend] = await createNamedUsers(factories, ["ModalFriend"]);
		await befriend(factories, [friend.id]);

		await page.setViewportSize(TABLET_VIEWPORT);
		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const sideNav = new SideNav(page);
		await expect(sideNav.sectionHeading("Events")).toHaveCount(0);

		await sideNav.openModal();
		await expect(sideNav.sectionHeading("Events")).toBeVisible();
		await expect(sideNav.sectionHeading("Friends")).toBeVisible();
		await expect(sideNav.sectionHeading("Streams")).toBeVisible();
		await expect(sideNav.friend("ModalFriend").trigger).toBeVisible();

		await sideNav.closeModal();
		await expect(sideNav.sectionHeading("Events")).toHaveCount(0);

		await sideNav.openModal();
		const friendRow = sideNav.friend("ModalFriend");
		await friendRow.openMenu();
		await friendRow.menuItem("View user page").click();

		await expect(page).toHaveURL(/\/u\//);
		await expect(sideNav.sectionHeading("Events")).toHaveCount(0);
		await expectNoErrorPage(page);
	});

	test("mobile panels show the same data as the desktop sidebar", async ({
		page,
		factories,
	}) => {
		const [friend] = await createNamedUsers(factories, ["StreamFriend"]);
		await befriend(factories, [friend.id]);

		await createInProgressMatch(factories, {
			name: "Streamed Tournament",
			friendId: friend.id,
		});
		await factories.LiveStreamFactory.replaceAll([{ userId: friend.id }]);

		const tournament = await factories.TournamentFactory.create({
			authorId: ADMIN_ID,
			name: "My Tournament",
			startTimes: [inHours(2)],
		});
		await factories.TournamentTeamFactory.create({
			tournamentId: tournament.id,
			memberUserIds: [NZAP_TEST_ID],
		});

		await page.setViewportSize(MOBILE_VIEWPORT);
		await impersonate(page, NZAP_TEST_ID);
		await new FrontPage(page).goto();

		const mobileNav = new MobileNav(page);
		await mobileNav.openPanel("friends");

		const friendRow = mobileNav.friend("StreamFriend");
		await expect(friendRow.locators.badge).toHaveText("Live");
		await friendRow.openMenu();
		expect(await friendRow.watchStreamHref()).toBe(
			twitchUrl(streamAccountOf(friend.id)),
		);
		await page.keyboard.press("Escape");

		await mobileNav.switchPanel("tourneys");
		await expect(mobileNav.eventItem("My Tournament")).toBeVisible();

		await mobileNav.switchPanel("menu");
		await expect(mobileNav.locators.streamsHeading).toBeVisible();
		await expect(mobileNav.streamItem("Streamed Tournament")).toBeVisible();

		await mobileNav.switchPanel("tourneys");
		await mobileNav.locators.viewAllLink.click();
		await expect(page).toHaveURL(EVENTS_PAGE);
		await expect(mobileNav.locators.viewAllLink).toHaveCount(0);
	});
});
