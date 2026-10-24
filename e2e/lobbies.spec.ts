import type { Page } from "@playwright/test";
import { addMinutes, subMinutes } from "date-fns";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, isNotVisible, test } from "./helpers/playwright";
import { LobbiesPage } from "./pages/lobbies/lobbies-page";
import { LobbyPage } from "./pages/lobbies/lobby-page";
import { NewLobbyPage } from "./pages/lobbies/new-lobby-page";

const LOBBY_NAME = "Test 8s";
const PLAYER_NAME_PREFIX = "LobbyPlayer";
const ROOM_SIZE = 8;
const BEST_OF = 3;
const MAPS_TO_WIN = 2;

test.describe("Lobbies", () => {
	/**
	 * Anyone can make a lobby and others sign up for it, from its page or the lobby list.
	 * Signing up before the start reserves a spot, check-in opening 10 minutes before the
	 * start, and once the lobby has started signing up checks in right away. Past the room
	 * size sign-ups go to the waitlist, the first on it taking a spot someone frees.
	 */
	test.describe("Signing up", () => {
		test("a lobby made to start now checks in whoever signs up", async ({
			page,
			factories,
		}) => {
			const host = await factories.UserFactory.create();
			const visitor = await factories.UserFactory.create();

			await impersonate(page, host.id);
			const newLobby = new NewLobbyPage(page);
			await newLobby.goto();
			await newLobby.form.fill("name", LOBBY_NAME);
			await newLobby.save();

			const lobby = new LobbyPage(page);
			await expect(lobby.heading(LOBBY_NAME)).toBeVisible();
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
			await isNotVisible(lobbyPage.locators.checkInButton);
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
		});

		test("joins a lobby from its card on the lobby list", async ({
			page,
			factories,
		}) => {
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

			await test.step("The waitlisted player has their spot", async () => {
				await impersonate(page, waitlisted.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.viewerStatus).toContainText(
					"You're signed up",
				);
			});
		});
	});

	/**
	 * The lobby starts once 8 have checked in after its start time, splitting the room into
	 * two teams for a set. One side reports the maps and the other confirms the result, after
	 * which the set shows on the Result tab and counts on the Rankings tab. The confirming side
	 * can instead dispute the result, the reporting side then undoing their report.
	 */
	test.describe("Playing sets", () => {
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
	});

	/**
	 * Leaving mid-set forfeits it for the leaver's team, leaving the room short of players.
	 * A player can instead ask to leave once the set is confirmed.
	 */
	test.describe("Leaving", () => {
		test("leaving mid-set forfeits it and the room waits for players", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer, bravoPlayer } = await startedLobby(
				page,
				factories,
			);
			const lobbyPage = new LobbyPage(page);

			await test.step("An Alpha player leaves mid-set", async () => {
				await impersonate(page, alphaPlayer.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.leave();
			});

			await test.step("The others wait for an eighth player", async () => {
				await impersonate(page, bravoPlayer.id);
				await lobbyPage.goto(lobby.id);

				await expect(lobbyPage.locators.waitingBanner).toContainText(
					"Waiting for players (7/8)",
				);
			});
		});

		test("a player asks to leave once the set is confirmed", async ({
			page,
			factories,
		}) => {
			const { lobby, alphaPlayer } = await startedLobby(page, factories);

			await impersonate(page, alphaPlayer.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.dropAfterSet();

			await expect(lobbyPage.locators.viewerStatus).toContainText(
				"You'll leave once this set is confirmed",
			);
		});
	});

	/**
	 * The host removes participants and ends the lobby. When the host leaves, the participant
	 * who signed up the earliest becomes the host.
	 */
	test.describe("Hosting", () => {
		test("the host removes a participant", async ({ page, factories }) => {
			const host = await factories.UserFactory.create();
			const signedUp = await factories.UserFactory.create();
			const lobby = await factories.LobbyFactory.create(
				{ hostUserId: host.id },
				{ signedUpUserIds: [signedUp.id] },
			);

			await impersonate(page, host.id);
			const lobbyPage = new LobbyPage(page);
			await lobbyPage.goto(lobby.id);
			await lobbyPage.removeParticipant(signedUp.id);

			await expect(lobbyPage.locators.participants).toHaveCount(1);
		});

		test("the earliest to sign up becomes the host when the host leaves", async ({
			page,
			factories,
		}) => {
			const host = await factories.UserFactory.create();
			const [earliest, latest] = await factories.UserFactory.createMany(2);
			const lobby = await factories.LobbyFactory.create(
				{ hostUserId: host.id },
				{ signedUpUserIds: [earliest.id, latest.id] },
			);
			const lobbyPage = new LobbyPage(page);

			await test.step("The host leaves", async () => {
				await impersonate(page, host.id);
				await lobbyPage.goto(lobby.id);
				await lobbyPage.leave();
			});

			await test.step("The earliest to sign up can manage the lobby", async () => {
				await impersonate(page, earliest.id);
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
});

/** A lobby starting in an hour with every spot of the room taken, then the waitlisted signed up. Returns one of the players with a spot. */
async function fullLobby(
	factories: Factories,
	waitlistedUserIds: number[] = [],
) {
	const [host, signedUp, ...others] =
		await factories.UserFactory.createMany(ROOM_SIZE);
	const lobby = await factories.LobbyFactory.create(
		{ hostUserId: host.id, roomSize: ROOM_SIZE },
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
 * A started lobby playing its first set: 7 of 8 players checked in and the last one checking
 * in through the UI, which starts the lobby. Returns a player of each side.
 */
async function startedLobby(page: Page, factories: Factories) {
	const players = await factories.UserFactory.createMany(ROOM_SIZE, (i) => ({
		discordName: `${PLAYER_NAME_PREFIX}${i}`,
	}));
	const lobby = await factories.LobbyFactory.create(
		{
			hostUserId: players[0].id,
			startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
			bestOf: BEST_OF,
		},
		{
			signedUpUserIds: players.slice(1).map((player) => player.id),
			checkedInUserIds: players.slice(0, -1).map((player) => player.id),
		},
	);

	const lastToCheckIn = players.at(-1)!;
	await impersonate(page, lastToCheckIn.id);
	const lobbyPage = new LobbyPage(page);
	await lobbyPage.goto(lobby.id);
	await lobbyPage.checkIn();

	const alphaNames = await lobbyPage.rosterUsernames("Alpha");
	const isAlpha = (i: number) =>
		alphaNames.some((name) => name.includes(`${PLAYER_NAME_PREFIX}${i}`));

	return {
		lobby,
		alphaPlayer: players.find((_, i) => isAlpha(i))!,
		bravoPlayer: players.find((_, i) => !isAlpha(i))!,
	};
}
