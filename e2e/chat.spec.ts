import { sub } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { FULL_GROUP_SIZE } from "~/features/sendouq/q-constants";
import invariant from "~/utils/invariant";
import { sendouQMatchPage } from "~/utils/urls";
import {
	chatHistoryStatus,
	fetchChatRooms,
	openSecondUser,
	slowMessageSends,
} from "./helpers/chat";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	MOBILE_VIEWPORT,
	runRoutine,
	TABLET_VIEWPORT,
	test,
} from "./helpers/playwright";
import { createInProgressMatch } from "./helpers/tournament";
import { FrontPage } from "./pages/front-page/front-page";
import { ChatSidebar } from "./pages/layout/chat-sidebar";
import { MobileNav } from "./pages/layout/mobile-nav";
import { SideNav } from "./pages/layout/side-nav";
import { SendouQLookingPage } from "./pages/sendouq/sendouq-looking-page";
import { SendouQMatchPage } from "./pages/sendouq/sendouq-match-page";
import { TournamentBracketsPage } from "./pages/tournament/tournament-brackets-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";

test.describe("Chat", () => {
	test("Send and receive: a message crosses between two participants live", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha, bravo } = await createMatch(factories);

		await impersonate(page, alpha[0].id);
		await new SendouQMatchPage(page).goto(match.id);

		const other = await openSecondUser(browser, workerBaseURL, bravo[0].id);
		try {
			await new SendouQMatchPage(other.page).goto(match.id);

			const alphaChat = new ChatSidebar(page);
			const bravoChat = new ChatSidebar(other.page);

			await alphaChat.chat().send("gg");

			await expect(bravoChat.chat().message("gg")).toBeVisible();
			// the optimistic row was reconciled with the persisted one
			await expect(alphaChat.chat().locators.pendingMessages).toHaveCount(0);

			await bravoChat.chat().send("gg wp");

			await expect(alphaChat.chat().message("gg wp")).toBeVisible();
		} finally {
			await other.close();
		}
	});

	test("Sends still in flight when the next one is fired all land", async ({
		page,
		factories,
	}) => {
		const { match, alpha } = await createMatch(factories);

		await impersonate(page, alpha[0].id);
		await new SendouQMatchPage(page).goto(match.id);
		// long enough that every send below is still unacknowledged when the next fires
		await slowMessageSends(page, 1000);

		const chat = new ChatSidebar(page).chat();
		const sent = ["msg-one", "msg-two", "msg-three"];

		for (const contents of sent) {
			await chat.send(contents);
		}

		await expect(chat.locators.pendingMessages).toHaveCount(0);
		await expect(chat.locators.messages).toHaveCount(sent.length);
		for (const contents of sent) {
			await expect(chat.message(contents)).toBeVisible();
		}
		await expect(page.getByText("Error happened")).toHaveCount(0);

		// the list still takes a send, rather than being wedged by the earlier ones
		await chat.send("msg-four");

		await expect(chat.message("msg-four")).toBeVisible();
	});

	test("A message sent before the event stream connected still arrives", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha, bravo } = await createMatch(factories);

		await impersonate(page, alpha[0].id);
		// the stream cannot be established while `blocked` holds, so the page loads
		// with its chat open but nothing listening behind it
		let blocked = true;
		await page.route(/\/sse$/, (route) =>
			blocked ? route.abort() : route.fallback(),
		);
		await new SendouQMatchPage(page).goto(match.id);

		const chat = new ChatSidebar(page).chat();
		// the composer being disabled is the page telling us it has no stream
		await expect(chat.locators.composer).toBeDisabled();

		const other = await openSecondUser(browser, workerBaseURL, bravo[0].id);
		try {
			await new SendouQMatchPage(other.page).goto(match.id);
			const theirChat = new ChatSidebar(other.page).chat();

			await theirChat.send("sent before you connected");
			await expect(theirChat.locators.pendingMessages).toHaveCount(0);

			await expect(chat.message("sent before you connected")).toHaveCount(0);

			blocked = false;

			// the stream comes up and the gap it left behind is caught up on
			await expect(chat.locators.composer).toBeEnabled({ timeout: 15_000 });
			await expect(chat.message("sent before you connected")).toBeVisible({
				timeout: 10_000,
			});

			// and it keeps delivering live from there on
			await theirChat.send("sent after you connected");

			await expect(chat.message("sent after you connected")).toBeVisible();
		} finally {
			await other.close();
		}
	});

	test("Split view: a participant gets the match and their own group chat, never the opponent's", async ({
		page,
		factories,
	}) => {
		const { match, alpha } = await createMatch(factories);

		await impersonate(page, alpha[0].id);
		await new SendouQMatchPage(page).goto(match.id);

		const chat = new ChatSidebar(page);

		// the route opens its rooms itself, stacked: match on top, group below
		await expect(chat.locators.splitPanels).toHaveCount(2);
		await expect(chat.locators.splitPanelHeaders).toHaveText(["Group"]);

		await chat.chat(1).send("only for my group");

		await expect(chat.chat(1).message("only for my group")).toBeVisible();
		await expect(chat.chat(0).message("only for my group")).toHaveCount(0);

		await chat.backToRoomList();

		// the two rooms the route opened are one combined row, and there is no third
		await expect(chat.locators.roomRows).toHaveCount(1);
		await expect(chat.locators.roomRows).toContainText("Match · Group");
	});

	test("Unread badge: counts messages arriving while the sidebar is closed and clears on open", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha, bravo } = await createMatch(factories);
		const matchRoom = `Match #${match.id}`;

		await impersonate(page, alpha[0].id);
		await new SendouQMatchPage(page).goto(match.id);

		const other = await openSecondUser(browser, workerBaseURL, bravo[0].id);
		try {
			// away from the match page, so nothing opens the room for them
			await new FrontPage(other.page).goto();

			const alphaChat = new ChatSidebar(page);
			const bravoChat = new ChatSidebar(other.page);

			await alphaChat.chat().send("one");
			await expect(alphaChat.chat().message("one")).toBeVisible();
			await alphaChat.chat().send("two");

			await expect(bravoChat.locators.toggleUnreadBadge).toHaveText("2");

			await bravoChat.open();

			await expect(bravoChat.roomRowUnreadBadge(matchRoom)).toHaveText("2");

			await bravoChat.openRoom(matchRoom);

			await expect(bravoChat.chat().message("two")).toBeVisible();

			await bravoChat.backToRoomList();

			await expect(bravoChat.roomRow(matchRoom)).toBeVisible();
			await expect(bravoChat.roomRowUnreadBadge(matchRoom)).toHaveCount(0);
		} finally {
			await other.close();
		}
	});

	test("Read state follows the user, not the device they read on", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha, bravo } = await createMatch(factories);
		const matchRoom = `Match #${match.id}`;

		await impersonate(page, alpha[0].id);
		await new SendouQMatchPage(page).goto(match.id);

		const phone = await openSecondUser(browser, workerBaseURL, bravo[0].id);
		const laptop = await openSecondUser(browser, workerBaseURL, bravo[0].id);
		try {
			await new FrontPage(phone.page).goto();
			await new FrontPage(laptop.page).goto();

			const phoneChat = new ChatSidebar(phone.page);
			const laptopChat = new ChatSidebar(laptop.page);

			await new ChatSidebar(page).chat().send("read me");

			await expect(phoneChat.locators.toggleUnreadBadge).toHaveText("1");
			await expect(laptopChat.locators.toggleUnreadBadge).toHaveText("1");

			const readPosts: string[] = [];
			phone.page.on("request", (request) => {
				if (
					request.method() === "POST" &&
					/\/chat\/rooms\/\d+\/read$/.test(new URL(request.url()).pathname)
				) {
					readPosts.push(request.url());
				}
			});

			await phoneChat.open();
			await phoneChat.openRoom(matchRoom);

			// the read indicator is posted debounced, so leaving the page this
			// soon after reading only tells the server if the unload flushes it
			expect(readPosts).toHaveLength(0);
			await new FrontPage(phone.page).goto();

			await new FrontPage(laptop.page).goto();
			await laptopChat.open();

			// the row being there proves the list was fetched, so the missing badge
			// is the server's count rather than a list that has not arrived yet
			await expect(laptopChat.roomRow(matchRoom)).toBeVisible();
			await expect(laptopChat.roomRowUnreadBadge(matchRoom)).toHaveCount(0);
		} finally {
			await Promise.all([phone.close(), laptop.close()]);
		}
	});

	test("Leaving a group takes its chat out of the sidebar without a reload", async ({
		page,
		factories,
	}) => {
		const [owner, member] = await factories.UserFactory.createMany(2);
		await factories.SQGroupFactory.create({
			memberUserIds: [owner.id, member.id],
		});

		await impersonate(page, member.id);
		const looking = new SendouQLookingPage(page);
		await looking.goto();

		const chat = new ChatSidebar(page);
		await expect(chat.locators.openChats).toHaveCount(1);

		const [groupRoom] = await fetchChatRooms(page);

		await looking.leaveGroup();

		await expect(chat.locators.openChats).toHaveCount(0);
		await expect(chat.locators.roomRows).toHaveCount(0);
		await expect(chat.locators.emptyState).toBeVisible();

		// and no reading the group's messages from outside it either
		expect(await chatHistoryStatus(page, groupRoom.id)).toBe(403);
	});

	test("Staff observer: chats in the match room, reads the group chats", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha } = await createMatch(factories);
		const staff = await factories.UserFactory.createStaff();

		await impersonate(page, alpha[0].id);
		await new SendouQMatchPage(page).goto(match.id);

		const participantChat = new ChatSidebar(page);
		await participantChat.chat(1).send("our own plan");

		const observer = await openSecondUser(browser, workerBaseURL, staff.id);
		try {
			await new SendouQMatchPage(observer.page).goto(match.id);

			const staffChat = new ChatSidebar(observer.page);

			// an observer chats alongside the participants in the match room
			await expect(staffChat.locators.openChats).toHaveCount(1);
			await staffChat.chat().send("staff here");

			await expect(participantChat.chat(0).message("staff here")).toBeVisible();

			await staffChat.backToRoomList();

			// the match room they are observing, plus both group chats to read
			await expect(staffChat.locators.roomRows).toHaveCount(3);

			await staffChat.openRoom("Group Alpha");

			await expect(staffChat.locators.headerSubtitle).toHaveText("Group Alpha");
			await expect(staffChat.chat().message("our own plan")).toBeVisible();
			await expect(staffChat.chat().locators.readOnlyNote).toBeVisible();
			await expect(staffChat.chat().locators.composer).toHaveCount(0);

			// an observed room is only theirs to read on the page that surfaced it:
			// leaving it closes the chat and returns them to their own room list
			await new SideNav(observer.page).goHome();

			await expect(staffChat.locators.openChats).toHaveCount(0);
			await expect(staffChat.locators.emptyState).toBeVisible();

			// the group chats are the staff member's to read, nobody else's
			await participantChat.backToRoomList();
			await expect(participantChat.locators.roomRows).toHaveCount(1);
		} finally {
			await observer.close();
		}
	});

	test("Tournament organizer posts into a match chat and is labelled", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { tournament, matchId } = await createInProgressMatch(factories, {
			name: "Chat Cup",
			friendId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const matchPage = new TournamentMatchPage(page);
		await matchPage.goto({ tournamentId: tournament.id, matchId });

		// the tournament's author, and so its organizer
		const organizer = await openSecondUser(browser, workerBaseURL);
		try {
			await new TournamentMatchPage(organizer.page).goto({
				tournamentId: tournament.id,
				matchId,
			});

			const organizerChat = new ChatSidebar(organizer.page);
			await organizerChat.chat().send("start when ready");

			const participantChat = new ChatSidebar(page);
			await expect(
				participantChat.chat().message("start when ready"),
			).toBeVisible();
			await expect(participantChat.chat().authorLabel("TO")).toBeVisible();
		} finally {
			await organizer.close();
		}
	});

	test("An observer coming back to a match chat sees what was said while they were away", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { tournament, matchId } = await createInProgressMatch(factories, {
			name: "Chat Cup",
			friendId: NZAP_TEST_ID,
		});

		const participant = await openSecondUser(
			browser,
			workerBaseURL,
			NZAP_TEST_ID,
		);
		try {
			await new TournamentMatchPage(participant.page).goto({
				tournamentId: tournament.id,
				matchId,
			});
			const participantChat = new ChatSidebar(participant.page).chat();

			// the tournament's author, and so an observer of the match chat
			await impersonate(page);
			const brackets = new TournamentBracketsPage(page);
			await brackets.goto(tournament.id);

			const matchPage = await brackets.openMatch(matchId);
			const chat = new ChatSidebar(page);

			await expect(chat.locators.openChats).toHaveCount(1);

			// an observer is only pushed the room's messages while on the page that
			// surfaced it, so what is said from here on never reaches their history
			await matchPage.backToBracket();

			await participantChat.send("said while you were on the bracket");
			await expect(participantChat.locators.pendingMessages).toHaveCount(0);

			await brackets.openMatch(matchId);

			await expect(
				chat.chat().message("said while you were on the bracket"),
			).toBeVisible();
		} finally {
			await participant.close();
		}
	});

	test("A closed room is readable by staff and denied to its participants", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha } = await createMatch(factories);
		const staff = await factories.UserFactory.createStaff();
		invariant(match.chatRoomId, "Match was created without a chat room");

		await impersonate(page, alpha[0].id);
		await new SendouQMatchPage(page).goto(match.id);
		const participantChat = new ChatSidebar(page);
		await participantChat.chat().send("before the room closed");
		// the message has to land before the room closes under it
		await expect(participantChat.chat().locators.pendingMessages).toHaveCount(
			0,
		);

		await factories.backdate("ChatRoom", match.chatRoomId, {
			expiresAt: sub(new Date(), { months: 2 }),
		});
		await runRoutine(page, "CloseExpiredChatRooms");

		expect(await chatHistoryStatus(page, match.chatRoomId)).toBe(403);

		const observer = await openSecondUser(browser, workerBaseURL, staff.id);
		try {
			await new SendouQMatchPage(observer.page).goto(match.id);

			const staffChat = new ChatSidebar(observer.page);

			await expect(
				staffChat.chat().message("before the room closed"),
			).toBeVisible();
			await expect(staffChat.chat().locators.composer).toHaveCount(0);
		} finally {
			await observer.close();
		}
	});

	test("An observer's message counts as unread away from the room's page", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha } = await createMatch(factories);
		const staff = await factories.UserFactory.createStaff();

		// away from the match page, with the chat closed: only the toggle's badge
		// tells the participant that anything was said
		await impersonate(page, alpha[0].id);
		await new FrontPage(page).goto();

		const chat = new ChatSidebar(page);
		await expect(chat.locators.toggleButton).toBeVisible();

		const observer = await openSecondUser(browser, workerBaseURL, staff.id);
		try {
			await new SendouQMatchPage(observer.page).goto(match.id);
			await new ChatSidebar(observer.page).chat().send("staff ping");

			await expect(chat.locators.toggleUnreadBadge).toHaveText("1");
		} finally {
			await observer.close();
		}
	});

	test("A system message renders live and moves the rooms to the inactive list", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha, bravo } = await createMatch(factories, {
			isReported: true,
		});

		// away from the match page, where the rooms are listed rather than combined
		await impersonate(page, alpha[0].id);
		await new FrontPage(page).goto();

		const alphaChat = new ChatSidebar(page);
		await alphaChat.open();

		// reporting already ended the reporter's group, the match room lives on
		await expect(alphaChat.roomRow(`Match #${match.id}`)).toBeVisible();
		await expect(alphaChat.locators.inactiveToggle).toHaveText(
			/Inactive \(1\)/,
		);

		const other = await openSecondUser(browser, workerBaseURL, bravo[0].id);
		try {
			const matchPage = new SendouQMatchPage(other.page);
			await matchPage.goto(match.id);
			await matchPage.confirmScore();

			await expect(
				new ChatSidebar(other.page).chat().message(/confirmed score/),
			).toBeVisible();

			// concluding the match ended both groups and the match room with them,
			// but its unread system message keeps it listed until it is read
			await expect(
				alphaChat.roomRowUnreadBadge(`Match #${match.id}`),
			).toHaveText("1");
			await expect(alphaChat.locators.inactiveToggle).toHaveText(
				/Inactive \(1\)/,
			);

			await alphaChat.openRoom(`Match #${match.id}`);

			await expect(alphaChat.chat().message(/confirmed score/)).toBeVisible();

			await alphaChat.backToRoomList();

			await expect(alphaChat.locators.roomRows).toHaveCount(0);
			await expect(alphaChat.locators.inactiveToggle).toHaveText(
				/Inactive \(2\)/,
			);
		} finally {
			await other.close();
		}
	});

	test("Mobile: the chat waits behind the tab bar, then opens straight into the room", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha, bravo } = await createMatch(factories);

		await page.setViewportSize(MOBILE_VIEWPORT);
		await impersonate(page, bravo[0].id);
		await new SendouQMatchPage(page).goto(match.id);

		const mobileNav = new MobileNav(page);
		const chat = new ChatSidebar(page);

		// the route's rooms are made active but not opened: the match page keeps
		// the whole viewport until the user asks for the chat
		await expect(mobileNav.tab("chat")).toBeVisible();
		await expect(chat.locators.openChats).toHaveCount(0);

		const other = await openSecondUser(browser, workerBaseURL, alpha[0].id);
		try {
			await new SendouQMatchPage(other.page).goto(match.id);
			await new ChatSidebar(other.page).chat().send("on my way");

			await expect(mobileNav.tabBadge("chat")).toHaveText("1");

			await mobileNav.openPanel("chat");

			// straight into the room rather than onto the room list
			await expect(chat.locators.splitPanels).toHaveCount(2);
			await expect(chat.chat().message("on my way")).toBeVisible();
			await expect(mobileNav.tabBadge("chat")).toHaveCount(0);

			await chat.chat().send("almost there");

			await expect(
				new ChatSidebar(other.page).chat().message("almost there"),
			).toBeVisible();

			await chat.close();

			await expect(chat.locators.openChats).toHaveCount(0);
		} finally {
			await other.close();
		}
	});

	test("Tablet: the chat is a modal, and leaving the page or the layout closes it", async ({
		page,
		browser,
		workerBaseURL,
		factories,
	}) => {
		const { match, alpha, bravo } = await createMatch(factories);
		const desktopViewport = page.viewportSize()!;
		const matchRoom = `Match #${match.id}`;

		await page.setViewportSize(TABLET_VIEWPORT);
		await impersonate(page, bravo[0].id);
		await new FrontPage(page).goto();

		const chat = new ChatSidebar(page);

		await expect(chat.locators.toggleButton).toBeVisible();
		await expect(chat.locators.modal).toHaveCount(0);

		const other = await openSecondUser(browser, workerBaseURL, alpha[0].id);
		try {
			await new SendouQMatchPage(other.page).goto(match.id);
			await new ChatSidebar(other.page).chat().send("tablet ping");

			await expect(chat.locators.toggleUnreadBadge).toHaveText("1");

			await chat.open();

			await expect(chat.locators.modal).toBeVisible();
			await chat.openRoom(matchRoom);

			await expect(chat.chat().message("tablet ping")).toBeVisible();

			// following the room's own link is how a chat modal gets navigated out
			// of, and Layout closes it on the pathname change — where the desktop
			// rail deliberately stays open
			await chat.followRoomLink();

			await expect(page).toHaveURL(sendouQMatchPage(match.id));
			await expect(chat.locators.modal).toHaveCount(0);

			// the route made its rooms active without opening them, so the modal
			// comes back on the split view
			await chat.open();

			await expect(chat.locators.splitPanels).toHaveCount(2);

			await chat.chat().send("tablet pong");

			await expect(
				new ChatSidebar(other.page).chat().message("tablet pong"),
			).toBeVisible();

			// leaving the tablet range closes the modal too, but the chat stays
			// open, so the desktop rail takes over with the same rooms
			await page.setViewportSize(desktopViewport);

			await expect(chat.locators.modal).toHaveCount(0);
			await expect(chat.locators.splitPanels).toHaveCount(2);
		} finally {
			await other.close();
		}
	});
});

async function createMatch(
	factories: Factories,
	{ isReported }: { isReported?: boolean } = {},
) {
	const alpha = await factories.UserFactory.createMany(FULL_GROUP_SIZE);
	const bravo = await factories.UserFactory.createMany(FULL_GROUP_SIZE);

	const match = await factories.SQMatchFactory.create(
		{
			alphaUserIds: alpha.map((member) => member.id),
			bravoUserIds: bravo.map((member) => member.id),
		},
		{ isReported },
	);

	return { match, alpha, bravo };
}
