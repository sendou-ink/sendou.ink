import type { Page } from "@playwright/test";
import { addMinutes, subHours, subMinutes } from "date-fns";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import type { LobbyRoomSize } from "~/features/lobbies/lobbies-constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { openSecondUser } from "./helpers/chat";
import type { Factories } from "./helpers/factories";
import {
	expect,
	impersonate,
	isNotVisible,
	loaderDataJson,
	navigate,
	runRoutine,
	test,
} from "./helpers/playwright";
import { ChatSidebar } from "./pages/layout/chat-sidebar";
import { ErrorPage } from "./pages/layout/error-page";
import { NotificationPopover } from "./pages/layout/notification-popover";
import { LobbiesPage } from "./pages/lobbies/lobbies-page";
import { LobbyPage } from "./pages/lobbies/lobby-page";
import { NewLobbyPage } from "./pages/lobbies/new-lobby-page";

const LOBBY_NAME = "Test 8s";
const PLAYER_NAME_PREFIX = "LobbyPlayer";
const ROOM_SIZE = 8;
const BEST_OF = 3;
const MAPS_TO_WIN = 2;
const ASSOCIATION_NAME = "Inkling Alliance";
const WEAPON_NAME = "Splattershot";
const LOBBY_DESCRIPTION = "Bring your main, no Tacticooler";

test.describe("Lobbies", () => {
	/**
	 * For now only an admin can make a lobby, others sign up for it. Signing up before the start reserves
	 * a spot, check-in opening 10 minutes before the start with a notification to the signed
	 * up, and once the lobby has started signing up checks in right away. Past the room size
	 * sign-ups go to the waitlist, the first on it taking a spot someone frees and being
	 * notified of it. When the lobby starts the waitlisted stay on the waitlist, unless
	 * someone with a spot didn't check in: then a waitlisted player checking in plays in
	 * their place.
	 */
	test.describe("Signing up", () => {
		test("a lobby made to start now checks in whoever signs up", async ({
			page,
			factories,
		}) => {
			const visitor = await factories.UserFactory.create();
			await factories.UserFactory.setFriendCode(ADMIN_ID);

			await impersonate(page, ADMIN_ID);
			const newLobby = new NewLobbyPage(page);
			await newLobby.goto();
			await newLobby.form.fill("name", LOBBY_NAME);
			await newLobby.form.fill("description", LOBBY_DESCRIPTION);
			await newLobby.save();

			const lobby = new LobbyPage(page);
			await expect(lobby.heading(LOBBY_NAME)).toBeVisible();
			await expect(lobby.locators.description).toHaveText(LOBBY_DESCRIPTION);
			await expect(lobby.locators.participants).toHaveCount(1);
			const lobbyId = Number(page.url().split("/").at(-1));

			await impersonate(page, visitor.id);
			await lobby.goto(lobbyId);
			await lobby.signUp();

			await expect(lobby.locators.participants).toHaveCount(2);
			await expect(lobby.locators.viewerStatus).toContainText("checked in");
		});

		test("signing up for a later lobby reserves a spot without check-in yet", async ({
			page,
			factories,
		}) => {
			const host = await factories.UserFactory.create();
			const visitor = await factories.UserFactory.create();
			const lobby = await factories.LobbyFactory.create({
				hostUserId: host.id,
			});

			await impersonate(page, visitor.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.signUp();

			await expect(lobbyPage.locators.viewerStatus).toContainText(
				"check-in opens 10 minutes before the start",
			);
			await expect(lobbyPage.locators.startBanner).toContainText(
				"Check-in opens at",
			);
			await isNotVisible(lobbyPage.locators.checkInButton);
		});

		test("the signed up are notified when check-in opens", async ({
			page,
			factories,
		}) => {
			const host = await factories.UserFactory.create();
			const signedUp = await factories.UserFactory.create();
			await factories.LobbyFactory.create(
				{
					hostUserId: host.id,
					name: LOBBY_NAME,
					startsAt: dateToDatabaseTimestamp(addMinutes(new Date(), 5)),
				},
				{ signedUpUserIds: [signedUp.id] },
			);

			await impersonate(page, signedUp.id);
			await runRoutine(page, "Lobbies");

			const notifications = await openNotifications(page);
			await expect(
				notifications.notification(`Check in to ${LOBBY_NAME}`),
			).toBeVisible();
		});

		test("a signed-up player checks in once check-in opens", async ({
			page,
			factories,
		}) => {
			const host = await factories.UserFactory.create();
			const signedUp = await factories.UserFactory.create();
			const lobby = await factories.LobbyFactory.create(
				{
					hostUserId: host.id,
					startsAt: dateToDatabaseTimestamp(addMinutes(new Date(), 5)),
				},
				{ signedUpUserIds: [signedUp.id] },
			);

			await impersonate(page, signedUp.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.checkIn();

			await expect(lobbyPage.locators.viewerStatus).toContainText(
				"You're checked in, the lobby starts soon",
			);
			await expect(lobbyPage.locators.startBanner).toContainText(
				"1/8 checked in",
			);
		});

		test("past the room size sign-ups go to the waitlist", async ({
			page,
			factories,
		}) => {
			const { lobby } = await fullLobby(factories);
			const visitor = await factories.UserFactory.create();

			await impersonate(page, visitor.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.signUp();

			await expect(lobbyPage.locators.viewerStatus).toContainText(
				"You're #1 on the waitlist",
			);
		});

		test("a spot freed before the start goes to the first on the waitlist", async ({
			page,
			factories,
		}) => {
			const waitlisted = await factories.UserFactory.create();
			const { lobby, signedUp } = await fullLobby(factories, [waitlisted.id]);
			const lobbyPage = new LobbyPage(page);

			await test.step("A signed-up player leaves", async () => {
				await impersonate(page, signedUp.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.leave();

				await expect(lobbyPage.locators.signUpButton).toBeVisible();
			});

			await test.step("The waitlisted player is notified and has their spot", async () => {
				await impersonate(page, waitlisted.id);
				const notifications = await openNotifications(page);
				await expect(
					notifications.notification(`You got a spot in ${LOBBY_NAME}`),
				).toBeVisible();

				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're signed up",
				);
			});
		});

		test("the waitlisted stay on the waitlist when everyone with a spot checks in", async ({
			page,
			factories,
		}) => {
			const { lobby, lastToCheckIn, waitlisted } =
				await startingLobby(factories);
			const lobbyPage = new LobbyPage(page);

			await test.step("The last player with a spot checks in, starting the lobby", async () => {
				await impersonate(page, lastToCheckIn.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.checkIn();

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're playing",
				);
			});

			await test.step("The waitlisted player is first on the waitlist", async () => {
				await impersonate(page, waitlisted.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're #1 on the waitlist",
				);
			});
		});

		test("a waitlisted player plays in place of one who didn't check in", async ({
			page,
			factories,
		}) => {
			const {
				lobby,
				lastToCheckIn: didNotCheckIn,
				waitlisted,
			} = await startingLobby(factories);
			const lobbyPage = new LobbyPage(page);

			await test.step("The waitlisted player checks in after the start", async () => {
				await impersonate(page, waitlisted.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.checkIn();

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're playing",
				);
			});

			await test.step("The one who didn't check in is no longer in the lobby", async () => {
				await impersonate(page, didNotCheckIn.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.signUpButton).toBeVisible();
			});
		});
	});

	/**
	 * Signing up and making a lobby take a friend code, making one is for now only for an
	 * admin, and a user in SendouQ or present in another lobby can't check in to a lobby
	 * until they leave it.
	 */
	test.describe("Who can join", () => {
		test("without a friend code a user can't sign up or make a lobby", async ({
			page,
			factories,
		}) => {
			const host = await factories.UserFactory.create();
			const withoutFriendCode = await factories.UserFactory.create({
				friendCode: null,
			});
			const lobby = await factories.LobbyFactory.create({
				hostUserId: host.id,
			});

			await impersonate(page, withoutFriendCode.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);

			await expect(lobbyPage.locators.friendCodeNeededText).toBeVisible();
			await isNotVisible(lobbyPage.locators.signUpButton);

			await impersonate(page, ADMIN_ID);
			const newLobby = new NewLobbyPage(page);
			await newLobby.goto();

			await expect(newLobby.locators.friendCodeNeededText).toBeVisible();
		});

		test("only an admin can make a lobby", async ({ page, factories }) => {
			const user = await factories.UserFactory.create();

			await impersonate(page, user.id);
			const errorPage = new ErrorPage(page);
			await new NewLobbyPage(page).goto();

			await expect(errorPage.locators.forbiddenHeading).toBeVisible();
		});

		test("a user in SendouQ can't check in", async ({ page, factories }) => {
			const host = await factories.UserFactory.create();
			const inSendouQ = await factories.UserFactory.create();
			await factories.SQGroupFactory.create({ memberUserIds: [inSendouQ.id] });
			const lobby = await factories.LobbyFactory.create(
				{
					hostUserId: host.id,
					startsAt: dateToDatabaseTimestamp(addMinutes(new Date(), 5)),
				},
				{ signedUpUserIds: [inSendouQ.id] },
			);

			await impersonate(page, inSendouQ.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.checkIn();

			// toasts render hidden in e2e runs
			await expect(
				page.getByText("Leave SendouQ before checking in to a lobby"),
			).toBeAttached();
			await expect(lobbyPage.locators.checkInButton).toBeVisible();
		});

		test("a player checked in to another lobby can't check in", async ({
			page,
			factories,
		}) => {
			const [host, otherHost, player] =
				await factories.UserFactory.createMany(3);
			const startsSoon = dateToDatabaseTimestamp(addMinutes(new Date(), 5));
			await factories.LobbyFactory.create(
				{ hostUserId: otherHost.id, startsAt: startsSoon },
				{ signedUpUserIds: [player.id], checkedInUserIds: [player.id] },
			);
			const lobby = await factories.LobbyFactory.create(
				{ hostUserId: host.id, startsAt: startsSoon },
				{ signedUpUserIds: [player.id] },
			);

			await impersonate(page, player.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.checkIn();

			// toasts render hidden in e2e runs
			await expect(
				page.getByText("Leave the other lobby before checking in to this one"),
			).toBeAttached();
			await expect(lobbyPage.locators.checkInButton).toBeVisible();
		});

		test("a player in another lobby's room can't join a started lobby", async ({
			page,
			factories,
		}) => {
			const { alphaPlayer } = await startedLobby(page, factories);
			const otherHost = await factories.UserFactory.create();
			const otherLobby = await factories.LobbyFactory.create(
				{
					hostUserId: otherHost.id,
					startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
				},
				{ checkedInUserIds: [otherHost.id] },
			);

			await impersonate(page, alphaPlayer.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(otherLobby.id);
			await lobbyPage.signUp();

			await expect(
				page.getByText("Leave the other lobby before checking in to this one"),
			).toBeAttached();
			await expect(lobbyPage.locators.participants).toHaveCount(1);
		});
	});

	/**
	 * A lobby limited to an association is listed only to its members, its card marked as
	 * such, and its page is not found for others. A link-only lobby is listed to no one but
	 * its participants: others find it only through the link its host shares, and once
	 * signed up they find it without the link too. Only the host gets the link to share.
	 */
	test.describe("Visibility", () => {
		test("a lobby limited to an association is hidden from outsiders", async ({
			page,
			factories,
		}) => {
			const [host, member, outsider] =
				await factories.UserFactory.createMany(3);
			const association = await factories.AssociationFactory.create(
				{ userId: host.id, name: ASSOCIATION_NAME },
				{ memberUserIds: [member.id] },
			);
			const lobby = await factories.LobbyFactory.create({
				hostUserId: host.id,
				name: LOBBY_NAME,
				visibility: { forAssociation: association.id },
			});
			const lobbies = new LobbiesPage(page);

			await test.step("A member of the association sees it marked as limited", async () => {
				await impersonate(page, member.id);
				await lobbies.goto();
				await lobbies.openTab("upcoming");

				await expect(lobbies.limitedVisibilityIcon(LOBBY_NAME)).toBeVisible();
			});

			await test.step("An outsider neither sees it listed nor finds its page", async () => {
				await impersonate(page, outsider.id);
				await lobbies.goto();
				await lobbies.openTab("upcoming");

				await expect(lobbies.card(LOBBY_NAME)).toHaveCount(0);

				const errorPage = new ErrorPage(page);
				await new LobbyPage(page).goto(lobby.id);
				await expect(errorPage.locators.notFoundHeading).toBeVisible();
			});
		});

		test("a link-only lobby is found only through its shared link", async ({
			page,
			factories,
		}) => {
			const [visitor, outsider] = await factories.UserFactory.createMany(2);
			await factories.UserFactory.setFriendCode(ADMIN_ID);
			const lobbyPage = new LobbyPage(page);
			const lobbies = new LobbiesPage(page);
			const errorPage = new ErrorPage(page);

			await impersonate(page, ADMIN_ID);
			const newLobby = new NewLobbyPage(page);
			await newLobby.goto();
			await newLobby.form.fill("name", LOBBY_NAME);
			await newLobby.selectVisibility("Only with the link");
			await newLobby.save();

			await expect(lobbyPage.heading(LOBBY_NAME)).toBeVisible();
			const lobbyId = Number(new URL(page.url()).pathname.split("/").at(-1));
			const shareLink = await lobbyPage.copyShareLink();

			await test.step("Without the link an outsider neither sees it listed nor finds its page", async () => {
				await impersonate(page, outsider.id);
				await lobbies.goto();
				await lobbies.openTab("running");

				await expect(lobbies.card(LOBBY_NAME)).toHaveCount(0);

				await lobbyPage.goto(lobbyId);
				await expect(errorPage.locators.notFoundHeading).toBeVisible();
			});

			await test.step("Through the link a visitor opens it and signs up", async () => {
				await impersonate(page, visitor.id);
				await lobbyPage.gotoViaShareLink(shareLink);
				await lobbyPage.signUp();

				await expect(lobbyPage.locators.participants).toHaveCount(2);
			});

			await test.step("Signed up, the visitor finds it without the link", async () => {
				await lobbies.goto();
				await lobbies.openTab("running");

				await expect(lobbies.card(LOBBY_NAME)).toBeVisible();

				await lobbyPage.goto(lobbyId);
				await expect(lobbyPage.heading(LOBBY_NAME)).toBeVisible();
			});

			await test.step("Not being the host, the visitor gets no link to share", async () => {
				const shareKey = new URL(shareLink).searchParams.get("key")!;

				await isNotVisible(lobbyPage.locators.copyShareLinkButton);
				expect(await loaderDataJson(page)).not.toContain(shareKey);
			});
		});
	});

	/**
	 * The lobby list splits lobbies into running and upcoming ones, opening on the tab of a
	 * lobby the viewer is in. A lobby can be joined and, before the viewer is in its room,
	 * left from its card.
	 */
	test.describe("Lobby list", () => {
		test("running and upcoming lobbies are on their own tabs, opening on the viewer's", async ({
			page,
			factories,
		}) => {
			const [runningHost, upcomingHost, viewer] =
				await factories.UserFactory.createMany(3);
			await factories.LobbyFactory.create({
				hostUserId: runningHost.id,
				name: "Running 8s",
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 30)),
			});
			await factories.LobbyFactory.create(
				{ hostUserId: upcomingHost.id, name: "Upcoming 8s" },
				{ signedUpUserIds: [viewer.id] },
			);

			await impersonate(page, viewer.id);
			const lobbies = new LobbiesPage(page);
			await lobbies.goto();

			await expect(lobbies.locators.selectedTab).toContainText("Upcoming");
			await expect(lobbies.card("Upcoming 8s")).toBeVisible();
			await expect(lobbies.card("Running 8s")).toHaveCount(0);

			await lobbies.openTab("running");

			await expect(lobbies.card("Running 8s")).toBeVisible();
		});

		test("joins a lobby from its card", async ({ page, factories }) => {
			const host = await factories.UserFactory.create();
			const visitor = await factories.UserFactory.create();
			await factories.LobbyFactory.create({
				hostUserId: host.id,
				name: LOBBY_NAME,
			});

			await impersonate(page, visitor.id);
			const lobbies = new LobbiesPage(page);
			await lobbies.goto();
			await lobbies.join(LOBBY_NAME);

			await expect(lobbies.card(LOBBY_NAME)).toContainText("Signed up");
		});

		test("leaves a lobby from its card", async ({ page, factories }) => {
			const host = await factories.UserFactory.create();
			const signedUp = await factories.UserFactory.create();
			await factories.LobbyFactory.create(
				{ hostUserId: host.id, name: LOBBY_NAME },
				{ signedUpUserIds: [signedUp.id] },
			);

			await impersonate(page, signedUp.id);
			const lobbies = new LobbiesPage(page);
			await lobbies.goto();
			await lobbies.leave(LOBBY_NAME);

			await expect(lobbies.card(LOBBY_NAME)).not.toContainText("Signed up");
			await expect(
				lobbies.card(LOBBY_NAME).getByTestId("lobby-join-button"),
			).toBeVisible();
		});
	});

	/**
	 * The lobby starts once 8 have checked in after its start time, splitting the room into
	 * two teams for a set and notifying its players. One side reports the maps, can undo a
	 * report while the set is being played, and the other confirms the result, after which
	 * the set shows on the Result tab and counts on the Rankings tab together with the
	 * weapons reported. The confirming side can instead dispute the result, the reporting
	 * side then undoing their report or the host settling it by confirming the result or
	 * undoing the report, whichever side they're on.
	 */
	test.describe("Playing sets", () => {
		test("starting the lobby notifies its players", async ({
			page,
			factories,
		}) => {
			const { host } = await startedLobby(page, factories);

			await impersonate(page, host.id);
			const notifications = await openNotifications(page);
			await expect(
				notifications.notification(
					`${LOBBY_NAME} started and you're in a room`,
				),
			).toBeVisible();
		});

		test("a set reported by one side and confirmed by the other counts", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer, bravoPlayer } = await startedLobby(
				page,
				factories,
			);
			const lobbyPage = new LobbyPage(page);

			await test.step("An Alpha player reports a sweep", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.reportOwnTeamSweep(MAPS_TO_WIN);
			});

			await test.step("A Bravo player confirms it", async () => {
				await impersonate(page, bravoPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.confirmSet();
			});

			await test.step("The set shows on the Rankings and Result tabs", async () => {
				await lobbyPage.goto(lobby.id, "leaderboard");
				await expect(lobbyPage.locators.leaderboardRows).toHaveCount(ROOM_SIZE);

				await lobbyPage.openTab("result");
				await expect(lobbyPage.locators.tabPanel).toContainText("2-0");
			});
		});

		test("a map report is undone while the set is being played", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer } = await startedLobby(page, factories);

			await impersonate(page, alphaPlayer.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id, "action");
			await lobbyPage.reportOwnTeamWin();

			await expect(lobbyPage.tab("result")).toBeVisible();

			await lobbyPage.undoReport();

			await expect(lobbyPage.tab("result")).toHaveCount(0);
		});

		test("a reported weapon shows on the Result and Rankings tabs", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer, bravoPlayer } = await startedLobby(
				page,
				factories,
			);
			const lobbyPage = new LobbyPage(page);

			await test.step("An Alpha player reports their weapon and a sweep", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.reportWeapon(WEAPON_NAME);
				await lobbyPage.reportOwnTeamSweep(MAPS_TO_WIN);
			});

			await test.step("A Bravo player confirms the set", async () => {
				await impersonate(page, bravoPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.confirmSet();
			});

			await test.step("The weapon shows on the Result and Rankings tabs", async () => {
				await lobbyPage.openTab("result");
				await expect(lobbyPage.weaponImage(WEAPON_NAME)).toBeVisible();

				await lobbyPage.openTab("leaderboard");
				await expect(
					lobbyPage
						.rankingsRow(alphaPlayer.name)
						.getByRole("img", { name: WEAPON_NAME }),
				).toBeVisible();
			});
		});

		test("a disputed result goes back to reporting when the reporting side undoes it", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer, bravoPlayer } = await startedLobby(
				page,
				factories,
			);
			const lobbyPage = new LobbyPage(page);

			await test.step("An Alpha player reports a sweep", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.reportOwnTeamSweep(MAPS_TO_WIN);
			});

			await test.step("A Bravo player disputes it", async () => {
				await impersonate(page, bravoPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.disputeResult();

				await expect(lobbyPage.locators.disputedText).toBeVisible();
			});

			await test.step("The Alpha player undoes the deciding report", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.undoReport();

				await expect(lobbyPage.locators.reportScoreButton).toBeVisible();
			});
		});

		test("the host undoes a disputed result the other team reported", async ({
			page,
			factories,
		}) => {
			const { lobby, host, alphaPlayers, bravoPlayers } = await startedLobby(
				page,
				factories,
			);
			const isHostAlpha = alphaPlayers.some((player) => player.id === host.id);
			const opponent = (isHostAlpha ? bravoPlayers : alphaPlayers)[0];
			const lobbyPage = new LobbyPage(page);

			await test.step("The other team reports a sweep", async () => {
				await impersonate(page, opponent.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.reportOwnTeamSweep(MAPS_TO_WIN);
			});

			await test.step("The host disputes it and undoes the deciding report", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.disputeResult();
				await lobbyPage.undoReport();

				await expect(lobbyPage.locators.reportScoreButton).toBeVisible();
			});
		});

		test("the host settles a disputed result by confirming it", async ({
			page,
			factories,
		}) => {
			const { lobby, host, alphaPlayers, bravoPlayers } = await startedLobby(
				page,
				factories,
			);
			const isHostAlpha = alphaPlayers.some((player) => player.id === host.id);
			const opponent = (isHostAlpha ? bravoPlayers : alphaPlayers)[0];
			const lobbyPage = new LobbyPage(page);

			await test.step("The host reports a sweep for their team", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.reportOwnTeamSweep(MAPS_TO_WIN);
			});

			await test.step("The other team disputes it", async () => {
				await impersonate(page, opponent.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.disputeResult();
			});

			await test.step("The host confirms the result, the set counting", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.confirmSetAsHost();

				await expect(lobbyPage.locators.reportScoreButton).toBeVisible();
				await lobbyPage.openTab("result");
				await expect(lobbyPage.locators.tabPanel).toContainText("2-0");
			});
		});
	});

	/**
	 * After a confirmed set the next one starts right away with the teams reshuffled, nobody
	 * keeping all of their teammates. In a room bigger than 8 the extra players sit a set
	 * out, rotating in for the next one. When the room is short of 8 the waitlist is asked,
	 * with a notification, who is ready to take the open spot, and confirming fills it. The
	 * first on the waitlist has priority on the spot for 3 minutes, others confirming before
	 * them waiting. Once the priority runs out the spot goes to whoever confirms first. Signing
	 * up while a spot is open counts as confirming.
	 */
	test.describe("Between sets", () => {
		test("the next set starts with the teams reshuffled", async ({
			page,
			factories,
		}) => {
			const { lobby, players, alphaPlayers, bravoPlayers } = await startedLobby(
				page,
				factories,
			);
			const lobbyPage = new LobbyPage(page);

			await playSet(page, {
				lobbyId: lobby.id,
				alphaPlayer: alphaPlayers[0],
				bravoPlayer: bravoPlayers[0],
			});

			await expect(lobbyPage.locators.reportScoreButton).toBeVisible();
			const nextAlphaIds = await rosterIds(lobbyPage, "Alpha", players);

			expect(nextAlphaIds).not.toEqual(idsOf(alphaPlayers));
			expect(nextAlphaIds).not.toEqual(idsOf(bravoPlayers));
		});

		test("in a room of 9 one sits a set out and plays the next", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer, bravoPlayer, sittingOut } =
				await startedLobby(page, factories, { roomSize: 9 });
			const spectator = sittingOut[0];
			const lobbyPage = new LobbyPage(page);

			await test.step("The ninth player spectates the first set", async () => {
				await impersonate(page, spectator.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're spectating, you'll rotate in",
				);
			});

			await playSet(page, { lobbyId: lobby.id, alphaPlayer, bravoPlayer });

			await test.step("They play the next set", async () => {
				await impersonate(page, spectator.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're playing",
				);
			});
		});

		test("the waitlist is asked to fill a spot that opens up", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer } = await startedLobby(page, factories);
			const lateSignUp = await factories.UserFactory.create();
			const lobbyPage = new LobbyPage(page);

			await test.step("A player signing up to the full room is waitlisted", async () => {
				await impersonate(page, lateSignUp.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.signUp();

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're #1 on the waitlist",
				);
			});

			await test.step("An Alpha player leaves, opening a spot", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.leaveMidSet();
			});

			await test.step("The waitlisted player is notified and confirms they're ready", async () => {
				await impersonate(page, lateSignUp.id);
				const notifications = await openNotifications(page);
				await expect(
					notifications.notification(`A spot is open in ${LOBBY_NAME}`),
				).toBeVisible();

				await lobbyPage.goto(lobby.id);
				await expect(lobbyPage.locators.readyCheck).toBeVisible();
				await lobbyPage.confirmReady();

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're playing",
				);
			});
		});

		test("the first on the waitlist takes the spot over a faster confirmer", async ({
			page,
			factories,
		}) => {
			const { lobby, waitlist } = await lobbyWithOpenSpot(page, factories);
			const [first, , third] = waitlist;
			const lobbyPage = new LobbyPage(page);

			await test.step("The third on the waitlist confirms first and waits", async () => {
				await impersonate(page, third.id);
				await lobbyPage.goto(lobby.id);
				await expect(lobbyPage.locators.waitingBanner).toContainText(
					"The waitlist has been asked to fill the open spots",
				);
				await lobbyPage.confirmReady();

				await expect(lobbyPage.locators.readyCheck).toContainText(
					"Confirmed, waiting for the others",
				);
				await expect(lobbyPage.locators.viewerStatus).not.toContainText(
					"You're playing",
				);
			});

			await test.step("The first on the waitlist confirms and gets the spot", async () => {
				await impersonate(page, first.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.confirmReady();

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're playing",
				);
			});

			await test.step("The third stays out of the room", async () => {
				await impersonate(page, third.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).not.toContainText(
					"You're playing",
				);
			});
		});

		test("signing up while the waitlist has priority counts as ready", async ({
			page,
			factories,
		}) => {
			const { lobby } = await lobbyWithOpenSpot(page, factories);
			const lateSignUp = await factories.UserFactory.create();
			const lobbyPage = new LobbyPage(page);

			await impersonate(page, lateSignUp.id);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.signUp();

			await expect(lobbyPage.locators.readyCheck).toContainText(
				"Confirmed, waiting for the others",
			);
			await isNotVisible(lobbyPage.locators.confirmReadyButton);
		});

		test("signing up once the priority has run out takes the spot right away", async ({
			page,
			factories,
		}) => {
			const { lobby } = await lobbyWithOpenSpot(page, factories);
			await factories.LobbyFactory.expireReadyChecks(lobby.id);
			const lateSignUp = await factories.UserFactory.create();
			const lobbyPage = new LobbyPage(page);

			await impersonate(page, lateSignUp.id);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.signUp();

			await expect(lobbyPage.locators.viewerStatus).toContainText(
				"You're playing",
			);
		});

		test("once the first's priority runs out the spot goes to whoever confirms first", async ({
			page,
			factories,
		}) => {
			const { lobby, waitlist } = await lobbyWithOpenSpot(page, factories);
			const [, second, third] = waitlist;
			await factories.LobbyFactory.expireReadyChecks(lobby.id);
			const lobbyPage = new LobbyPage(page);

			await test.step("The third on the waitlist confirms first and gets the spot", async () => {
				await impersonate(page, third.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.confirmReady();

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're playing",
				);
			});

			await test.step("The second is too late, the spot taken", async () => {
				await impersonate(page, second.id);
				await lobbyPage.goto(lobby.id);

				await isNotVisible(lobbyPage.locators.readyCheck);
				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're #2 on the waitlist",
				);
			});
		});
	});

	/**
	 * Leaving mid-set forfeits it for the leaver's team once a map has been reported, whatever
	 * the score: the set shows as won by forfeit and counts as a set win and loss on the
	 * Rankings, the room left short of players. Leaving before any map is reported calls the
	 * set off, nobody losing it. A player can instead ask to leave once the set is confirmed, leaving the lobby
	 * then. Asking to is told in the lobby's chat and marked on the Rosters tab, the mark
	 * explaining itself when clicked.
	 */
	test.describe("Leaving", () => {
		test("leaving mid-set forfeits it and the room waits for players", async ({
			page,
			factories,
		}) => {
			const { lobby, host, alphaPlayers, bravoPlayer } = await startedLobby(
				page,
				factories,
			);
			// not the host, who ends the lobby in the end
			const alphaPlayer = alphaPlayers.find((player) => player.id !== host.id)!;
			const lobbyPage = new LobbyPage(page);

			await test.step("Alpha wins the first map, then an Alpha player leaves", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.reportOwnTeamWin();
				await lobbyPage.leaveMidSet();
			});

			await test.step("The others wait for an eighth player, no one on the waitlist to ask", async () => {
				await impersonate(page, bravoPlayer.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.waitingBanner).toContainText(
					"Waiting for players (7/8)",
				);
				await expect(lobbyPage.locators.waitingBanner).not.toContainText(
					"The waitlist has been asked to fill the open spots",
				);
				// no set being played, so no rosters to show
				await isNotVisible(lobbyPage.tab("rosters"));
			});

			await test.step("Bravo is awarded the set on the Result and Rankings tabs", async () => {
				await lobbyPage.openTab("result");
				await expect(lobbyPage.locators.forfeitNote).toHaveText(
					"Bravo won by forfeit",
				);

				await lobbyPage.openTab("leaderboard");
				await expect(
					lobbyPage
						.rankingsRow(bravoPlayer.name)
						.getByRole("cell", { name: "1-0", exact: true }),
				).toBeVisible();
				await expect(
					lobbyPage
						.rankingsRow(alphaPlayer.name)
						.getByRole("cell", { name: "0-1", exact: true }),
				).toBeVisible();
			});

			await test.step("The Rankings tell who has left the lobby", async () => {
				await expect(lobbyPage.locators.leftLobbyMarkers).toHaveCount(1);
				await lobbyPage.leftLobbyMarker(alphaPlayer.name).click();
				await expect(lobbyPage.locators.leftLobbyPopover).toHaveText(
					"Left the lobby",
				);
			});

			await test.step("Once the lobby has ended no one is marked as left", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.endLobby();
				await expect(lobbyPage.locators.endedStatus).toBeVisible();

				await lobbyPage.openTab("leaderboard");
				await expect(lobbyPage.rankingsRow(alphaPlayer.name)).toBeVisible();
				await expect(lobbyPage.locators.leftLobbyMarkers).toHaveCount(0);
			});
		});

		test("a player asks to leave once the set is confirmed", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer, bravoPlayer } = await startedLobby(
				page,
				factories,
			);
			const lobbyPage = new LobbyPage(page);
			const chat = new ChatSidebar(page);

			await test.step("An Alpha player asks to leave after the set and plays it out", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id, "action");
				await lobbyPage.dropAfterSet();

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You'll leave once this set is confirmed",
				);

				await lobbyPage.reportOwnTeamSweep(MAPS_TO_WIN);
			});

			await test.step("A Bravo player sees they are leaving and confirms the set", async () => {
				await impersonate(page, bravoPlayer.id);
				await lobbyPage.goto(lobby.id, "action");

				await lobbyPage.openTab("rosters");
				await expect(lobbyPage.locators.leavingAfterSetMarkers).toHaveCount(1);
				await lobbyPage.leavingAfterSetMarker(alphaPlayer.name).click();
				await expect(lobbyPage.locators.leavingAfterSetPopover).toContainText(
					`${alphaPlayer.name} leaves the lobby once this set is confirmed`,
				);
				await lobbyPage.openTab("action");

				await chat.selectRoomTab("Lobby");
				await expect(
					chat.chat().message(`${alphaPlayer.name} will leave after this set`),
				).toBeVisible();

				await lobbyPage.confirmSet();

				await expect(lobbyPage.locators.waitingBanner).toContainText(
					"Waiting for players (7/8)",
				);
			});

			await test.step("The Alpha player is out of the lobby", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.signUpButton).toBeVisible();
			});
		});
	});

	/**
	 * The host kicks participants, who are told so and can't sign up for the lobby again, a
	 * player kicked mid-set forfeiting it for their team. The host also sits players of the
	 * room out of the sets until resumed, changes the best of from the next set on and ends
	 * the lobby. The host can hand hosting over to another participant, which
	 * the lobby's chat tells everyone. When the host leaves, the participant who signed up the
	 * earliest becomes the host and is notified of it.
	 */
	test.describe("Hosting", () => {
		test("a kicked player is told so and can't sign up again", async ({
			page,
			browser,
			workerBaseURL,
			factories,
		}) => {
			const host = await factories.UserFactory.create();
			const kicked = await factories.UserFactory.create();
			const lobby = await factories.LobbyFactory.create(
				{ hostUserId: host.id },
				{ signedUpUserIds: [kicked.id] },
			);

			await impersonate(page, kicked.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);

			await test.step("The host kicks them", async () => {
				const hostSession = await openSecondUser(
					browser,
					workerBaseURL,
					host.id,
				);
				try {
					const hostLobbyPage = new LobbyPage(hostSession.page);
					await hostLobbyPage.goto(lobby.id);
					await hostLobbyPage.kick(kicked.id);

					await expect(hostLobbyPage.locators.participants).toHaveCount(1);
				} finally {
					await hostSession.close();
				}
			});

			await test.step("Their open page tells them they were kicked", async () => {
				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"The host kicked you from the lobby",
				);
				await isNotVisible(lobbyPage.locators.signUpButton);
			});

			await test.step("Coming back they still can't sign up", async () => {
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"The host kicked you from the lobby",
				);
				await isNotVisible(lobbyPage.locators.signUpButton);
			});
		});

		test("kicking a player mid-set forfeits it for their team", async ({
			page,
			factories,
		}) => {
			const { lobby, host, alphaPlayers, bravoPlayers } = await startedLobby(
				page,
				factories,
			);
			const isHostAlpha = alphaPlayers.some((player) => player.id === host.id);
			const opponent = (isHostAlpha ? bravoPlayers : alphaPlayers)[0];

			await impersonate(page, host.id);
			const lobbyPage = new LobbyPage(page);
			// before a map is reported the set would be called off instead
			await lobbyPage.goto(lobby.id, "action");
			await lobbyPage.reportOwnTeamWin();
			// the room's players are on the Rankings tab, with the host's player menu
			await lobbyPage.openTab("leaderboard");
			await lobbyPage.kick(opponent.id);

			await lobbyPage.openTab("result");
			await expect(lobbyPage.locators.forfeitNote).toHaveText(
				`${isHostAlpha ? "Alpha" : "Bravo"} won by forfeit`,
			);
		});

		test("a player sat out by the host sits out the sets until resumed", async ({
			page,
			factories,
		}) => {
			const { lobby, host, alphaPlayer, bravoPlayer, alphaPlayers } =
				await startedLobby(page, factories, { roomSize: 9 });
			const satOut = alphaPlayers.find(
				(player) => player.id !== host.id && player.id !== alphaPlayer.id,
			)!;
			const lobbyPage = new LobbyPage(page);

			await test.step("The host sits a playing player out", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id, "leaderboard");
				await lobbyPage.sitOut(satOut.id);
			});

			await playSet(page, { lobbyId: lobby.id, alphaPlayer, bravoPlayer });

			await test.step("They sit the next set out", async () => {
				await impersonate(page, satOut.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"The host has you sitting out until they resume you",
				);
			});

			await test.step("The host resumes them", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id, "leaderboard");
				await lobbyPage.resume(satOut.id);

				await impersonate(page, satOut.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're spectating, you'll rotate in",
				);
			});
		});

		test("a changed best of applies from the next set", async ({
			page,
			factories,
		}) => {
			const { lobby, host, alphaPlayer, bravoPlayer } = await startedLobby(
				page,
				factories,
			);
			const lobbyPage = new LobbyPage(page);

			await test.step("The host changes the best of mid-set", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.changeBestOf(5);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.bestOf(BEST_OF)).toBeVisible();
			});

			await playSet(page, { lobbyId: lobby.id, alphaPlayer, bravoPlayer });

			await test.step("The next set is a best of 5", async () => {
				await expect(lobbyPage.bestOf(5)).toBeVisible();
			});
		});

		test("the host makes another participant the host", async ({
			page,
			factories,
		}) => {
			const { lobby, host, players } = await startedLobby(page, factories);
			// not the earliest to sign up, who'd be the host anyway were the host to leave
			const newHost = players.at(-1)!;
			const lobbyPage = new LobbyPage(page);
			const chat = new ChatSidebar(page);

			await test.step("The host hands hosting over, the lobby's chat telling of it", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id, "leaderboard");
				await lobbyPage.makeHost(newHost.id);

				await isNotVisible(lobbyPage.locators.endLobbyButton);
				await chat.selectRoomTab("Lobby");
				await expect(
					chat.chat().message(`${newHost.name} is now the host`),
				).toBeVisible();
			});

			await test.step("The new host is marked on the Rankings tab and can manage the lobby", async () => {
				await impersonate(page, newHost.id);
				await lobbyPage.goto(lobby.id, "leaderboard");

				await expect(lobbyPage.hostMarker(newHost.name)).toBeVisible();
				await isNotVisible(lobbyPage.hostMarker(host.name));
				await expect(lobbyPage.locators.endLobbyButton).toBeVisible();
			});
		});

		test("the earliest to sign up becomes the host when the host leaves", async ({
			page,
			factories,
		}) => {
			const host = await factories.UserFactory.create();
			const [earliest, latest] = await factories.UserFactory.createMany(2);
			const lobby = await factories.LobbyFactory.create(
				{ hostUserId: host.id, name: LOBBY_NAME },
				{ signedUpUserIds: [earliest.id, latest.id] },
			);
			const lobbyPage = new LobbyPage(page);

			await test.step("The host leaves", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.leave();
			});

			await test.step("The earliest to sign up is notified and can manage the lobby", async () => {
				await impersonate(page, earliest.id);
				const notifications = await openNotifications(page);
				await expect(
					notifications.notification(`You are now the host of ${LOBBY_NAME}`),
				).toBeVisible();

				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.endLobbyButton).toBeVisible();
			});
		});

		test("the host ends the lobby", async ({ page, factories }) => {
			const host = await factories.UserFactory.create();
			const lobby = await factories.LobbyFactory.create({
				hostUserId: host.id,
			});

			await impersonate(page, host.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.endLobby();

			await expect(lobbyPage.locators.endedStatus).toBeVisible();
		});
	});

	/**
	 * A lobby has a chat for everyone in it and one per team, a team's chat reaching only its
	 * players. Every set starts with fresh team chats while the lobby's chat carries on. The
	 * lobby page opens a player's two chats side by side.
	 */
	test.describe("Chat", () => {
		test("a team's chat reaches only its players", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayers, bravoPlayer } = await startedLobby(
				page,
				factories,
			);
			const [sender, teammate] = alphaPlayers;
			const lobbyPage = new LobbyPage(page);
			const chat = new ChatSidebar(page);

			await test.step("An Alpha player writes to their team and to the lobby", async () => {
				await impersonate(page, sender.id);
				await lobbyPage.goto(lobby.id);

				// as tabs while the view is too short to stack them
				await expect(chat.locators.splitPanels).toHaveCount(2);
				await expect(chat.locators.roomTabs).toHaveText(["Lobby", "Team"]);

				await chat.selectRoomTab("Team");
				await chat.chat().send("alpha only");
				await expect(chat.chat().message("alpha only")).toBeVisible();

				await chat.selectRoomTab("Lobby");
				await chat.chat().send("hello lobby");
				await expect(chat.chat().message("hello lobby")).toBeVisible();
				await expect(chat.chat().message("alpha only")).toHaveCount(0);
			});

			await test.step("Their teammate reads the team message", async () => {
				await impersonate(page, teammate.id);
				await lobbyPage.goto(lobby.id);

				await chat.selectRoomTab("Team");
				await expect(chat.chat().message("alpha only")).toBeVisible();
			});

			await test.step("A Bravo player reads only the lobby message", async () => {
				await impersonate(page, bravoPlayer.id);
				await lobbyPage.goto(lobby.id);

				await chat.selectRoomTab("Team");
				await expect(chat.chat().message("alpha only")).toHaveCount(0);

				await chat.selectRoomTab("Lobby");
				await expect(chat.chat().message("hello lobby")).toBeVisible();
			});

			await test.step("The two chats are one row of the room list", async () => {
				await chat.backToRoomList();

				await expect(chat.locators.roomRows).toHaveCount(1);
				await expect(chat.locators.roomRows).toContainText("Lobby · Team");
			});
		});

		test("every set starts with fresh team chats", async ({
			page,
			factories,
		}) => {
			const { lobby, players, alphaPlayers, bravoPlayers } = await startedLobby(
				page,
				factories,
			);
			const sender = alphaPlayers[0];
			const lobbyPage = new LobbyPage(page);
			const chat = new ChatSidebar(page);

			await test.step("An Alpha player writes to their team and to the lobby in the first set", async () => {
				await impersonate(page, sender.id);
				await lobbyPage.goto(lobby.id);

				await chat.selectRoomTab("Team");
				await chat.chat().send("first set plan");
				await expect(chat.chat().message("first set plan")).toBeVisible();

				await chat.selectRoomTab("Lobby");
				await chat.chat().send("hello lobby");
				await expect(chat.chat().message("hello lobby")).toBeVisible();
			});

			await playSet(page, {
				lobbyId: lobby.id,
				alphaPlayer: sender,
				bravoPlayer: bravoPlayers[0],
			});

			await expect(lobbyPage.locators.reportScoreButton).toBeVisible();
			const nextAlphaIds = await rosterIds(lobbyPage, "Alpha", players);
			const senderTeamIds = nextAlphaIds.includes(sender.id)
				? nextAlphaIds
				: idsOf(players).filter((id) => !nextAlphaIds.includes(id));
			const newTeammate = players.find(
				(player) =>
					player.id !== sender.id && senderTeamIds.includes(player.id),
			)!;
			// the teams were reshuffled, so someone of the first set's team now plays against the sender
			const formerTeammate = alphaPlayers.find(
				(player) => !senderTeamIds.includes(player.id),
			)!;

			await test.step("The sender's team chat of the next set starts empty", async () => {
				await impersonate(page, sender.id);
				await lobbyPage.goto(lobby.id);

				await chat.selectRoomTab("Team");
				await chat.chat().send("second set plan");
				await expect(chat.chat().message("second set plan")).toBeVisible();
				await expect(chat.chat().message("first set plan")).toHaveCount(0);

				await chat.selectRoomTab("Lobby");
				await expect(chat.chat().message("hello lobby")).toBeVisible();
			});

			await test.step("Their new teammate reads only the next set's message", async () => {
				await impersonate(page, newTeammate.id);
				await lobbyPage.goto(lobby.id);

				await chat.selectRoomTab("Team");
				await expect(chat.chat().message("second set plan")).toBeVisible();
				await expect(chat.chat().message("first set plan")).toHaveCount(0);
			});

			await test.step("A former teammate now on the other team reads neither", async () => {
				await impersonate(page, formerTeammate.id);
				await lobbyPage.goto(lobby.id);

				await chat.selectRoomTab("Team");
				await chat.chat().send("other team plan");
				await expect(chat.chat().message("other team plan")).toBeVisible();
				await expect(chat.chat().message("second set plan")).toHaveCount(0);
				await expect(chat.chat().message("first set plan")).toHaveCount(0);
			});
		});
	});

	/**
	 * A started lobby closes on its own after 2 hours waiting for players or 2 hours without
	 * a map reported, moving to the Ended tab of its players' lobby list. It also ends when
	 * everyone has left after the start.
	 */
	test.describe("Closing", () => {
		test("a lobby waiting for players for 2 hours closes", async ({
			page,
			factories,
		}) => {
			const [host, ...others] = await factories.UserFactory.createMany(
				ROOM_SIZE - 1,
			);
			await factories.LobbyFactory.create(
				{
					hostUserId: host.id,
					name: LOBBY_NAME,
					startsAt: dateToDatabaseTimestamp(subHours(new Date(), 3)),
					pendingSince: dateToDatabaseTimestamp(
						subMinutes(new Date(), 2 * 60 + 1),
					),
				},
				{
					signedUpUserIds: others.map((user) => user.id),
					checkedInUserIds: [host, ...others].map((user) => user.id),
				},
			);

			await impersonate(page, host.id);
			await runRoutine(page, "Lobbies");

			const lobbies = new LobbiesPage(page);
			await lobbies.goto();
			await lobbies.openTab("ended");

			await expect(lobbies.card(LOBBY_NAME)).toBeVisible();
		});

		test("a set without a map reported for 2 hours closes the lobby", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer } = await startedLobby(page, factories);
			await factories.LobbyFactory.backdateSets(
				lobby.id,
				subMinutes(new Date(), 2 * 60 + 1),
			);

			await impersonate(page, alphaPlayer.id);
			await runRoutine(page, "Lobbies");

			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);

			await expect(lobbyPage.locators.endedStatus).toBeVisible();
		});

		test("a started lobby everyone left ends", async ({ page, factories }) => {
			const host = await factories.UserFactory.create();
			const lobby = await factories.LobbyFactory.create(
				{
					hostUserId: host.id,
					startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
				},
				{ checkedInUserIds: [host.id] },
			);

			await impersonate(page, host.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.leave();

			await expect(lobbyPage.locators.endedStatus).toBeVisible();
		});
	});
});

type Player = { id: number; name: string };

/** A lobby starting in an hour with every spot of the room taken, then the waitlisted signed up. Returns one of the players with a spot. */
async function fullLobby(
	factories: Factories,
	waitlistedUserIds: number[] = [],
) {
	const [host, signedUp, ...others] =
		await factories.UserFactory.createMany(ROOM_SIZE);
	const lobby = await factories.LobbyFactory.create(
		{ hostUserId: host.id, name: LOBBY_NAME, roomSize: ROOM_SIZE },
		{
			signedUpUserIds: [
				signedUp.id,
				...others.map((user) => user.id),
				...waitlistedUserIds,
			],
		},
	);

	return { lobby, signedUp };
}

/**
 * A lobby that started a minute ago with every spot taken and one more on the waitlist,
 * everyone with a spot but the last to sign up checked in.
 */
async function startingLobby(factories: Factories) {
	const [host, ...others] = await factories.UserFactory.createMany(ROOM_SIZE);
	const waitlisted = await factories.UserFactory.create();
	const lastToCheckIn = others.at(-1)!;
	const lobby = await factories.LobbyFactory.create(
		{
			hostUserId: host.id,
			roomSize: ROOM_SIZE,
			startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
		},
		{
			signedUpUserIds: [...others, waitlisted].map((user) => user.id),
			checkedInUserIds: [host, ...others.slice(0, -1)].map((user) => user.id),
		},
	);

	return { lobby, lastToCheckIn, waitlisted };
}

/**
 * A started lobby playing its first set: a full room checked in but the last one, who checks
 * in through the UI and so starts the lobby. Returns its players by side, the first player
 * being the host.
 */
async function startedLobby(
	page: Page,
	factories: Factories,
	{ roomSize = ROOM_SIZE }: { roomSize?: LobbyRoomSize } = {},
) {
	const users = await factories.UserFactory.createMany(roomSize, (i) => ({
		discordName: `${PLAYER_NAME_PREFIX}${i}`,
	}));
	const players = users.map((user, i) => ({
		id: user.id,
		name: `${PLAYER_NAME_PREFIX}${i}`,
	}));
	const lobby = await factories.LobbyFactory.create(
		{
			hostUserId: players[0].id,
			name: LOBBY_NAME,
			roomSize,
			startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			bestOf: BEST_OF,
		},
		{
			signedUpUserIds: idsOf(players.slice(1)),
			checkedInUserIds: idsOf(players.slice(0, -1)),
		},
	);

	await impersonate(page, players.at(-1)!.id);
	const lobbyPage = new LobbyPage(page);
	await lobbyPage.goto(lobby.id);
	await lobbyPage.checkIn();

	const alphaIds = await rosterIds(lobbyPage, "Alpha", players);
	const bravoIds = await rosterIds(lobbyPage, "Bravo", players);
	const alphaPlayers = players.filter((player) => alphaIds.includes(player.id));
	const bravoPlayers = players.filter((player) => bravoIds.includes(player.id));

	return {
		lobby,
		players,
		host: players[0],
		alphaPlayers,
		bravoPlayers,
		alphaPlayer: alphaPlayers[0],
		bravoPlayer: bravoPlayers[0],
		sittingOut: players.filter(
			(player) =>
				!alphaIds.includes(player.id) && !bravoIds.includes(player.id),
		),
	};
}

/**
 * A started lobby with three players signed up to its full room, in order, and a spot then
 * opened by an Alpha player leaving, which asks the waitlist who is ready to take it.
 */
async function lobbyWithOpenSpot(page: Page, factories: Factories) {
	const { lobby, alphaPlayer } = await startedLobby(page, factories);
	const waitlist = await factories.UserFactory.createMany(3);
	const lobbyPage = new LobbyPage(page);

	for (const user of waitlist) {
		await impersonate(page, user.id);
		await lobbyPage.goto(lobby.id);
		await lobbyPage.signUp();
	}

	await impersonate(page, alphaPlayer.id);
	await lobbyPage.goto(lobby.id);
	await lobbyPage.leaveMidSet();

	return { lobby, waitlist };
}

/** An Alpha player reports a sweep and a Bravo player confirms it, the Bravo player's page left open. */
async function playSet(
	page: Page,
	{
		lobbyId,
		alphaPlayer,
		bravoPlayer,
	}: { lobbyId: number; alphaPlayer: Player; bravoPlayer: Player },
) {
	const lobbyPage = new LobbyPage(page);

	await test.step("Alpha sweeps the set and Bravo confirms it", async () => {
		await impersonate(page, alphaPlayer.id);
		await lobbyPage.goto(lobbyId, "action");
		await lobbyPage.reportOwnTeamSweep(MAPS_TO_WIN);

		await impersonate(page, bravoPlayer.id);
		await lobbyPage.goto(lobbyId, "action");
		await lobbyPage.confirmSet();
	});
}

/** Ids of the players on the side's roster of the current set, sorted. */
async function rosterIds(
	lobbyPage: LobbyPage,
	side: "Alpha" | "Bravo",
	players: Player[],
) {
	const names = await lobbyPage.rosterUsernames(side);

	return idsOf(
		players.filter((player) =>
			names.some((name) => name.includes(player.name)),
		),
	);
}

function idsOf(players: Array<{ id: number }>) {
	return players.map((player) => player.id).sort((a, b) => a - b);
}

/** Opens the viewer's notifications away from the lobby page, which would mark its own as read. */
async function openNotifications(page: Page) {
	await navigate({ page, url: "/" });
	const notifications = new NotificationPopover(page);
	await notifications.open();

	return notifications;
}
