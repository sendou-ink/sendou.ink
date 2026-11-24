import type { Browser } from "@playwright/test";
import { NZAP_TEST_ID } from "~/db/seed/constants";
import { broadcastDashboardPage } from "~/features/broadcast/broadcast-urls";
import type { Factories } from "./helpers/factories";
import { expect, impersonate, test } from "./helpers/playwright";
import { ROSTER_SIZE, startedTournamentTimes } from "./helpers/tournament";
import { BroadcastDashboardPage } from "./pages/broadcast/broadcast-dashboard-page";
import { BroadcastDesignPage } from "./pages/broadcast/broadcast-design-page";
import { BroadcastPage } from "./pages/broadcast/broadcast-page";
import { BroadcastProgramPage } from "./pages/broadcast/broadcast-program-page";
import { TournamentMatchPage } from "./pages/tournament/tournament-match-page";

const CAST_ACCOUNT = "broadcast_cast";
const OTHER_CAST_ACCOUNT = "broadcast_other";
const TEAM_COUNT = 2;

test.describe("Broadcast", () => {
	test("casts a match, takes scenes, edits the queue and holds next", async ({
		page,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
			isMatchCast: false,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		await expect(dashboard.locators.noFeaturedMatch).toBeVisible();

		const match = new TournamentMatchPage(page);
		await match.goto({
			tournamentId: tournament.id,
			matchId: tournament.matchId,
		});
		await match.openTab("admin");
		await match.setCastedBy(CAST_ACCOUNT);

		await dashboard.goto();
		await expect(dashboard.locators.featuredMatch).toContainText("Team 1");
		await expect(dashboard.locators.featuredMatch).toContainText("Team 2");
		await expect(dashboard.viewHeading("live", "rosters")).toBeVisible();
		await expect(dashboard.viewHeading("next", "game")).toBeVisible();

		await expect(dashboard.locators.onGameStart).toBeVisible();
		await dashboard.hold();
		await expect(dashboard.locators.onGameStart).toBeHidden();
		await expect(dashboard.locators.holdButton).toBeHidden();

		await dashboard.take();
		await expect(dashboard.viewHeading("live", "game")).toBeVisible();
		await expect(dashboard.viewHeading("next", "results")).toBeVisible();

		await dashboard.queueScene();
		await expect(dashboard.queueItem(1)).toBeVisible();
		await dashboard.pickScene("bracket");
		await expect(dashboard.queueItem(1)).toContainText("Bracket");

		await dashboard.selectQueueItem(0);
		await dashboard.removeQueueItem(0);
		await expect(dashboard.queueItem(1)).toBeHidden();
		await expect(dashboard.viewHeading("next", "bracket")).toBeVisible();

		await dashboard.take();
		await expect(dashboard.viewHeading("live", "bracket")).toBeVisible();
	});

	test("cuts to the game on the program when the scanner sees it start and swaps its sides without a Take", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: tournament.id,
			programKey: tournament.programKey,
		});
		await expect(obs.program.scene("rosters")).toBeVisible();

		expect(await dashboard.postGameSignal({ type: "start", inks: null })).toBe(
			200,
		);

		await expect(dashboard.viewHeading("live", "game")).toBeVisible();
		await expect(obs.program.scene("game")).toBeVisible();
		await expect(obs.program.teamName("game", "a")).toHaveText("Team 1");

		await dashboard.swapSides();

		await expect(obs.program.teamName("game", "a")).toHaveText("Team 2");
		await expect(obs.program.teamName("game", "b")).toHaveText("Team 1");
		await expect(dashboard.viewHeading("live", "game")).toBeVisible();

		await obs.close();
	});

	test("keeps the dashboard when a Take can't reach the server, and takes once it can", async ({
		page,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		await expect(dashboard.viewHeading("live", "rosters")).toBeVisible();

		await dashboard.takeUnreachable();

		await expect(dashboard.locators.takeButton).toBeEnabled();
		await expect(dashboard.viewHeading("live", "rosters")).toBeVisible();

		await dashboard.take();
		await expect(dashboard.viewHeading("live", "game")).toBeVisible();
	});

	test("turns off the on-air controls without moving them while the dashboard's stream is down", async ({
		page,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		const { locators } = dashboard;
		const onAirControls = [
			locators.takeButton,
			locators.holdButton,
			locators.swapSidesButton,
			locators.inkButton,
		];
		for (const control of onAirControls) {
			await expect(control).toBeEnabled();
		}
		await expect(locators.connectionBanner).toBeHidden();
		const takeBox = await locators.takeButton.boundingBox();

		const restoreStream = await dashboard.cutStream();

		await expect(locators.connectionBanner).toBeVisible();
		await expect(locators.lastUpdate).toBeVisible();
		for (const control of onAirControls) {
			await expect(control).toBeDisabled();
		}
		await expect(locators.obsHealth).toBeVisible();
		await expect(locators.scannerHealth).toBeVisible();
		expect(await locators.takeButton.boundingBox()).toEqual(takeBox);

		await restoreStream();

		await expect(locators.connectionBanner).toBeHidden({ timeout: 15_000 });
		for (const control of onAirControls) {
			await expect(control).toBeEnabled();
		}
	});

	test("puts a Take made while the OBS source's stream was down on air once it reconnects", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: tournament.id,
			programKey: tournament.programKey,
		});
		await expect(obs.program.scene("rosters")).toBeVisible();

		const restoreStream = await obs.program.cutStream();
		await dashboard.take();
		await expect(dashboard.viewHeading("live", "game")).toBeVisible();
		await expect(obs.program.scene("rosters")).toBeVisible();

		await restoreStream();
		await expect(obs.program.scene("game")).toBeVisible({ timeout: 15_000 });

		await obs.close();
	});

	test("shows a saved theme on the program", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: tournament.id,
			programKey: tournament.programKey,
		});
		await expect(obs.program.locators.canvas).not.toHaveCSS(
			"outline-width",
			"7px",
		);

		await dashboard.locators.themeTab.click();
		await expect(dashboard.locators.themeName("Default styles")).toBeVisible();
		await dashboard.saveTheme(
			"[data-broadcast] { outline: 7px solid rgb(1, 2, 3); }",
		);

		await expect(obs.program.locators.canvas).toHaveCSS("outline-width", "7px");
		await expect(dashboard.locators.themeName("Your own theme")).toBeVisible();

		await obs.close();
	});

	test("loads a preset in the designer to edit and shows it on the program", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const design = new BroadcastDesignPage(page, pageArgs(tournament.id));
		await design.goto();
		await expect(design.locators.presetSelect).toContainText("Default");

		await design.pickPreset("Zine");
		await expect(design.locators.presetSelect).toContainText("Zine");
		await expect(design.locators.editor).toHaveValue(/ZINE/);

		const presetCss = await design.locators.editor.inputValue();
		await design.locators.editor.fill(
			`${presetCss}\n[data-broadcast] { outline: 7px solid rgb(1, 2, 3); }`,
		);
		await expect(design.locators.presetSelect).toContainText("Your own");
		await design.save();

		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: tournament.id,
			programKey: tournament.programKey,
		});
		await expect(obs.program.locators.canvas).toHaveCSS("outline-width", "7px");
		await expect(obs.program.locators.canvas).toHaveCSS(
			"color",
			"rgb(20, 20, 20)",
		);

		await design.goto();
		await design.pickPreset("Teletext");
		await design.locators.confirmPresetButton.click();
		await expect(design.locators.presetSelect).toContainText("Teletext");
		await expect(design.locators.editor).toHaveValue(/TELETEXT/);

		await obs.close();
	});

	test("opens the channel the OBS URL shows and switches between channels", async ({
		page,
		factories,
	}) => {
		const [streamer] = await factories.UserFactory.createMany(1);
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
			programUserId: streamer.id,
		});
		await factories.TournamentFactory.addCastAccount({
			tournamentId: tournament.id,
			twitchAccount: OTHER_CAST_ACCOUNT,
		});
		await factories.TournamentBroadcastFactory.pointProgram({
			userId: NZAP_TEST_ID,
			tournamentId: tournament.id,
			channel: { platform: "TWITCH", account: OTHER_CAST_ACCOUNT },
		});

		await impersonate(page, NZAP_TEST_ID);
		await new BroadcastPage(page, tournament.id).goto();
		await expect(page).toHaveURL(
			broadcastDashboardPage({
				tournamentId: tournament.id,
				slug: OTHER_CAST_ACCOUNT,
			}),
		);

		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.channelChip(CAST_ACCOUNT).click();
		await expect(page).toHaveURL(
			broadcastDashboardPage(pageArgs(tournament.id)),
		);
		await expect(dashboard.locators.featuredMatch).toContainText("Team 1");
	});

	test("adds the first cast channel from the broadcast page", async ({
		page,
		factories,
	}) => {
		const tournament = await factories.TournamentFactory.create({
			authorId: NZAP_TEST_ID,
			startTimes: startedTournamentTimes(),
		});

		await impersonate(page, NZAP_TEST_ID);
		const broadcast = new BroadcastPage(page, tournament.id);
		await broadcast.goto();
		await broadcast.addChannel(CAST_ACCOUNT);

		await expect(page).toHaveURL(
			broadcastDashboardPage(pageArgs(tournament.id)),
		);
		await expect(
			page.getByRole("heading", { name: `Broadcast · ${CAST_ACCOUNT}` }),
		).toBeVisible();
	});

	test("keeps everyone but producers out of producing", async ({
		page,
		factories,
	}) => {
		const [organizer] = await factories.UserFactory.createMany(1);
		const tournament = await createBroadcasting(factories, {
			authorId: organizer.id,
		});

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		const program = new BroadcastProgramPage(page, pageArgs(tournament.id));

		expect(await dashboard.responseStatus()).toBe(404);
		expect(await dashboard.postGameSignal({ type: "start", inks: null })).toBe(
			404,
		);
		expect(await program.responseStatus(null)).toBe(404);
		expect(await program.responseStatus(tournament.programKey)).toBe(200);
		expect(await program.refusedStreamStatus("scanner")).toBe(404);
		expect(await program.refusedStreamStatus("source")).toBe(404);
	});

	test("keeps one OBS URL across tournaments, showing the broadcast it was pointed at", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const lastWeek = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});
		const thisWeek = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});
		expect(thisWeek.programKey).toBe(lastWeek.programKey);

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(lastWeek.id));
		await dashboard.goto();
		await dashboard.saveTheme(
			"[data-broadcast] { outline: 7px solid rgb(1, 2, 3); }",
		);
		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: thisWeek.id,
			programKey: thisWeek.programKey,
		});
		await expect(obs.program.scene("rosters")).toBeVisible();
		await expect(obs.program.locators.canvas).not.toHaveCSS(
			"outline-width",
			"7px",
		);
		// a load of the page would meet a deploy's gateway error, switching over must not load it
		await obs.program.failPageLoads();

		await dashboard.pointProgram();

		await expect(dashboard.locators.programShowsThis).toBeVisible();
		await expect(obs.program.locators.canvas).toHaveCSS("outline-width", "7px");
		await expect(obs.program.scene("rosters")).toBeVisible();

		await obs.close();
	});

	test("blanks the OBS source once its URL gets a new key", async ({
		page,
		browser,
		baseURL,
		factories,
	}) => {
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});
		const obs = await openObsSource({
			browser,
			baseURL: baseURL!,
			tournamentId: tournament.id,
			programKey: tournament.programKey,
		});
		await expect(obs.program.scene("rosters")).toBeVisible();

		await impersonate(page, NZAP_TEST_ID);
		const dashboard = new BroadcastDashboardPage(page, pageArgs(tournament.id));
		await dashboard.goto();
		await dashboard.regenerateProgramKey();

		await expect(obs.program.locators.canvas).toHaveCount(0);

		await obs.close();
	});

	test("keeps the OBS source empty while a stylesheet failed to load, until the page loaded again", async ({
		browser,
		baseURL,
		factories,
	}) => {
		// waits for the page's watchdog
		test.setTimeout(60_000);
		const tournament = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});
		const context = await browser.newContext({
			baseURL,
			viewport: { width: 1920, height: 1080 },
		});
		await context.route(/\.css(\?|$)/, (route) => route.abort(), {
			times: 1,
		});
		const program = new BroadcastProgramPage(
			await context.newPage(),
			pageArgs(tournament.id),
		);

		await program.goto(tournament.programKey);
		await expect(program.locators.shell).toHaveCSS("opacity", "0");

		await expect(program.locators.shell).toHaveCSS("opacity", "1", {
			timeout: 30_000,
		});
		await expect(program.scene("rosters")).toBeVisible();

		await context.close();
	});

	test("remembers the capture card source with the OBS URL in the next tournament", async ({
		page,
		factories,
	}) => {
		const lastWeek = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});
		const thisWeek = await createBroadcasting(factories, {
			authorId: NZAP_TEST_ID,
		});

		await impersonate(page, NZAP_TEST_ID);
		const lastWeekDashboard = new BroadcastDashboardPage(
			page,
			pageArgs(lastWeek.id),
		);
		await lastWeekDashboard.goto();
		await lastWeekDashboard.saveCaptureCardSource("Elgato HD60");

		const thisWeekDashboard = new BroadcastDashboardPage(
			page,
			pageArgs(thisWeek.id),
		);
		await thisWeekDashboard.goto();
		await thisWeekDashboard.locators.setupTab.click();
		await expect(thisWeekDashboard.locators.captureCardSourceInput).toHaveValue(
			"Elgato HD60",
		);
	});
});

function pageArgs(tournamentId: number) {
	return { tournamentId, slug: CAST_ACCOUNT };
}

/** The setup of the `tournament-broadcast` dev scenario: two teams, their match cast on the channel, the author's OBS URL showing it. */
async function createBroadcasting(
	factories: Factories,
	{
		authorId,
		isMatchCast,
		programUserId,
	}: { authorId: number; isMatchCast?: boolean; programUserId?: number },
) {
	const players = await factories.UserFactory.createMany(
		TEAM_COUNT * ROSTER_SIZE,
	);

	return factories.TournamentFactory.createBroadcasting(
		{ authorId, startTimes: startedTournamentTimes() },
		{
			teamRosters: Array.from({ length: TEAM_COUNT }, (_, idx) =>
				players
					.slice(idx * ROSTER_SIZE, (idx + 1) * ROSTER_SIZE)
					.map((player) => player.id),
			),
			twitchAccount: CAST_ACCOUNT,
			isMatchCast,
			programUserId,
		},
	);
}

/** The program in a browser of its own with no session, as OBS shows it from the keyed URL. */
async function openObsSource({
	browser,
	baseURL,
	tournamentId,
	programKey,
}: {
	browser: Browser;
	baseURL: string;
	tournamentId: number;
	programKey: string;
}) {
	const context = await browser.newContext({
		baseURL,
		viewport: { width: 1920, height: 1080 },
	});
	const program = new BroadcastProgramPage(
		await context.newPage(),
		pageArgs(tournamentId),
	);
	await program.goto(programKey);

	return { program, close: () => context.close() };
}
