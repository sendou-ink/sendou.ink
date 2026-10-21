import { subMinutes } from "date-fns";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { expect, impersonate, test } from "./helpers/playwright";
import { LobbyPage } from "./pages/lobbies/lobby-page";
import { NewLobbyPage } from "./pages/lobbies/new-lobby-page";

test.describe("Lobbies", () => {
	test("creates a lobby that others sign up for", async ({
		page,
		factories,
	}) => {
		const host = await factories.UserFactory.create();
		const visitor = await factories.UserFactory.create();

		await impersonate(page, host.id);
		const newLobby = new NewLobbyPage(page);
		await newLobby.goto();
		await newLobby.form.fill("name", "Test 8s");
		await newLobby.save();

		await expect(page).toHaveURL(/\/lobbies\/\d+$/);
		const lobbyId = Number(page.url().split("/").at(-1));
		const lobby = new LobbyPage(page);
		await expect(lobby.heading("Test 8s")).toBeVisible();
		await expect(lobby.locators.participants).toHaveCount(1);

		await impersonate(page, visitor.id);
		await lobby.goto(lobbyId);
		await lobby.signUp();

		await expect(lobby.locators.participants).toHaveCount(2);
		// the form starts it right away, so signing up is checking in
		await expect(lobby.locators.viewerStatus).toContainText("checked in");
	});

	test("plays a set, confirms it and moves on to the next", async ({
		page,
		factories,
	}) => {
		const players = await factories.UserFactory.createMany(8, (i) => ({
			discordName: `LobbyPlayer${i}`,
		}));
		const usernameOf = (i: number) => `LobbyPlayer${i}`;
		const lobby = await factories.LobbyFactory.create(
			{
				hostUserId: players[0].id,
				startsAt: dateToDatabaseTimestamp(subMinutes(new Date(), 1)),
				bestOf: 3,
			},
			{
				signedUpUserIds: players.slice(1).map((player) => player.id),
				checkedInUserIds: players.slice(0, 7).map((player) => player.id),
			},
		);

		// the last one checking in starts the lobby
		await impersonate(page, players[7].id);
		const lobbyPage = new LobbyPage(page);
		await lobbyPage.goto(lobby.id);
		await lobbyPage.checkIn();

		await impersonate(page, NZAP_TEST_ID);
		await lobbyPage.goto(lobby.id);
		const alphaNames = await lobbyPage.rosterUsernames("Alpha");
		const playerOf = (inAlpha: boolean) =>
			players.find(
				(_, i) =>
					alphaNames.some((name) => name.includes(usernameOf(i))) === inAlpha,
			)!;

		await impersonate(page, playerOf(true).id);
		await lobbyPage.goto(lobby.id, "action");
		await lobbyPage.reportOwnTeamSweep(2);

		await impersonate(page, playerOf(false).id);
		await lobbyPage.goto(lobby.id, "action");
		await lobbyPage.confirmSet();

		await lobbyPage.goto(lobby.id, "leaderboard");
		await expect(lobbyPage.locators.leaderboardRows).toHaveCount(8);
		await lobbyPage.openTab("result");
		await expect(page.getByRole("tabpanel")).toContainText("2-0");
	});

	test("the host ends the lobby", async ({ page, factories }) => {
		const host = await factories.UserFactory.create();
		const lobby = await factories.LobbyFactory.create({ hostUserId: host.id });

		await impersonate(page, host.id);
		const lobbyPage = new LobbyPage(page);
		await lobbyPage.goto(lobby.id);
		await lobbyPage.endLobby();

		await expect(page.getByText("Ended")).toBeVisible();
	});
});
